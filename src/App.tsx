import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Search, Download, MapPin, Building2, Hash, Maximize, Loader2, Store, ChefHat, Map, AlertCircle, Trash2 } from 'lucide-react';
import { extractRestaurants } from './services/gemini';
import { exportToCSV } from './utils/export';
import { ExtractionParams, Restaurant } from './types';

const STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

const TYPES = [
  'Restaurante', 'Pizzaria', 'Churrascaria', 'Quiosque', 'Barraca de Praia',
  'Bar', 'Café', 'Fast Food', 'Hamburgueria', 'Padaria'
];

const SIZES = ['Qualquer', 'Pequeno', 'Médio', 'Grande'];

export default function App() {
  const [params, setParams] = useState<ExtractionParams>({
    state: 'SP',
    city: 'São Paulo',
    type: 'Restaurante',
    quantity: 10,
    size: 'Qualquer'
  });
  
  const [citiesForState, setCitiesForState] = useState<string[]>([]);
  const [citySearch, setCitySearch] = useState('São Paulo');
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const cityDropdownRef = useRef<HTMLDivElement>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<Restaurant[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Buscar cidades da API do IBGE quando o estado mudar
  useEffect(() => {
    async function fetchCities() {
      if (!params.state) return;
      try {
        const res = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${params.state}/municipios`);
        const data = await res.json();
        setCitiesForState(data.map((c: any) => c.nome));
      } catch (e) {
        console.error("Erro ao buscar cidades:", e);
      }
    }
    fetchCities();
  }, [params.state]);

  // Fechar o dropdown de cidades ao clicar fora dele
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (cityDropdownRef.current && !cityDropdownRef.current.contains(event.target as Node)) {
        setShowCityDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validação da cidade
    if (!citiesForState.includes(citySearch)) {
      setError(`A cidade "${citySearch}" não foi encontrada no estado ${params.state}. Por favor, selecione uma cidade válida na lista.`);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const data = await extractRestaurants({ ...params, city: citySearch });
      setResults(data);
    } catch (err: any) {
      setError(err.message || 'Ocorreu um erro ao extrair os dados. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setResults([]);
    setError(null);
  };

  const handleDownload = () => {
    if (results.length === 0) return;
    const filename = `extracao_${params.type.toLowerCase()}_${citySearch.toLowerCase()}_${new Date().getTime()}.csv`;
    exportToCSV(results, filename);
  };

  const filteredCities = citiesForState.filter(c => 
    c.toLowerCase().includes(citySearch.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-stone-800 font-sans selection:bg-orange-200">
      {/* Header */}
      <header className="bg-white border-b border-stone-200/60 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-gradient-to-br from-orange-500 to-rose-500 p-2 rounded-xl text-white shadow-sm">
              <ChefHat size={24} />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-stone-900">
              Extrator de <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-rose-600">Restaurantes</span>
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Hero Section */}
        <div className="max-w-3xl">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-stone-900 mb-4">
            Encontre contatos de estabelecimentos em segundos.
          </h2>
          <p className="text-lg text-stone-500">
            Configure os parâmetros abaixo e nossa IA irá extrair uma lista estruturada de restaurantes, quiosques, pizzarias e muito mais, pronta para download.
          </p>
        </div>

        {/* Configuration Form */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-stone-200/60"
        >
          <form onSubmit={handleExtract} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
              
              {/* State */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
                  <Map size={16} className="text-stone-400" />
                  Estado
                </label>
                <select 
                  value={params.state}
                  onChange={(e) => {
                    setParams({...params, state: e.target.value});
                    setCitySearch(''); // Limpa a cidade ao trocar de estado
                  }}
                  className="w-full h-11 px-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
                >
                  {STATES.map(state => <option key={state} value={state}>{state}</option>)}
                </select>
              </div>

              {/* City with Autocomplete */}
              <div className="space-y-2 relative" ref={cityDropdownRef}>
                <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
                  <MapPin size={16} className="text-stone-400" />
                  Cidade
                </label>
                <input 
                  type="text"
                  required
                  value={citySearch}
                  onChange={(e) => {
                    setCitySearch(e.target.value);
                    setShowCityDropdown(true);
                  }}
                  onFocus={() => setShowCityDropdown(true)}
                  placeholder="Digite a cidade..."
                  className="w-full h-11 px-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
                />
                
                {/* Dropdown */}
                {showCityDropdown && citySearch.length >= 3 && (
                  <ul className="absolute z-50 w-full mt-1 bg-white border border-stone-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                    {filteredCities.map(city => (
                      <li 
                        key={city}
                        onClick={() => {
                          setCitySearch(city);
                          setShowCityDropdown(false);
                        }}
                        className="px-4 py-2 hover:bg-orange-50 cursor-pointer text-sm text-stone-700 transition-colors"
                      >
                        {city}
                      </li>
                    ))}
                    {filteredCities.length === 0 && (
                      <li className="px-4 py-3 text-sm text-stone-500 text-center">
                        Nenhuma cidade encontrada
                      </li>
                    )}
                  </ul>
                )}
              </div>

              {/* Type */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
                  <Store size={16} className="text-stone-400" />
                  Tipo
                </label>
                <select 
                  value={params.type}
                  onChange={(e) => setParams({...params, type: e.target.value})}
                  className="w-full h-11 px-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
                >
                  {TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>

              {/* Size */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
                  <Maximize size={16} className="text-stone-400" />
                  Porte
                </label>
                <select 
                  value={params.size}
                  onChange={(e) => setParams({...params, size: e.target.value})}
                  className="w-full h-11 px-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
                >
                  {SIZES.map(size => <option key={size} value={size}>{size}</option>)}
                </select>
              </div>

              {/* Quantity */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
                  <Hash size={16} className="text-stone-400" />
                  Quantidade
                </label>
                <input 
                  type="number"
                  min="1"
                  max="50"
                  required
                  value={params.quantity}
                  onChange={(e) => setParams({...params, quantity: parseInt(e.target.value) || 1})}
                  className="w-full h-11 px-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
                />
              </div>
            </div>

            <div className="pt-4 flex items-center justify-end border-t border-stone-100">
              <button 
                type="submit" 
                disabled={isLoading}
                className="h-12 px-6 bg-stone-900 hover:bg-stone-800 text-white rounded-xl font-medium flex items-center gap-2 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Extraindo Dados...
                  </>
                ) : (
                  <>
                    <Search size={18} />
                    Iniciar Extração
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>

        {/* Error Message */}
        {error && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-red-50 text-red-700 p-4 rounded-2xl flex items-start gap-3 border border-red-100"
          >
            <AlertCircle className="shrink-0 mt-0.5" size={20} />
            <p>{error}</p>
          </motion.div>
        )}

        {/* Results Section */}
        {results.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h3 className="text-xl font-semibold text-stone-900">
                Resultados Encontrados ({results.length})
              </h3>
              <div className="flex items-center gap-3">
                <button 
                  onClick={handleClear}
                  className="h-11 px-5 bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 rounded-xl font-medium flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95"
                >
                  <Trash2 size={18} />
                  Limpar
                </button>
                <button 
                  onClick={handleDownload}
                  className="h-11 px-5 bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white rounded-xl font-medium flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95"
                >
                  <Download size={18} />
                  Baixar CSV
                </button>
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-stone-200/60 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-stone-50/50 border-b border-stone-200/60 text-sm font-medium text-stone-500">
                      <th className="px-6 py-4 whitespace-nowrap">Nome</th>
                      <th className="px-6 py-4 whitespace-nowrap">Cidade</th>
                      <th className="px-6 py-4 whitespace-nowrap">Telefone/WhatsApp</th>
                      <th className="px-6 py-4 whitespace-nowrap">Email</th>
                      <th className="px-6 py-4 whitespace-nowrap">Tipo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {results.map((item, idx) => (
                      <tr key={idx} className="hover:bg-stone-50/50 transition-colors text-sm text-stone-700">
                        <td className="px-6 py-4 font-medium text-stone-900">{item.name}</td>
                        <td className="px-6 py-4">{item.city}</td>
                        <td className="px-6 py-4">{item.phone || '-'}</td>
                        <td className="px-6 py-4 text-stone-500">{item.email || '-'}</td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-stone-100 text-stone-600">
                            {item.type}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}
