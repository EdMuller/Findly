import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Search, Download, MapPin, Building2, Hash, Maximize, Loader2, Store, ChefHat, Map, AlertCircle, Trash2, StopCircle, Clock, Star, Plus, Target, RefreshCw } from 'lucide-react';
import { extractRestaurants } from './services/gemini';
import { exportToExcel } from './utils/export';
import { ExtractionParams, Restaurant, Priority, CityConfig } from './types';

const STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

const TYPES = [
  'Restaurante', 'Pizzaria', 'Churrascaria', 'Quiosque', 'Barraca de Praia',
  'Bar', 'Café', 'Fast Food', 'Hamburgueria', 'Padaria'
];

const SIZES = ['Qualquer', 'Pequeno', 'Médio', 'Grande'];
const PRIORITIES: Priority[] = ['Nenhuma', 'Telefone', 'WhatsApp', 'Email'];
const TIME_LIMITS = [
  { label: '30 Segundos', value: 30 },
  { label: '1 Minuto', value: 60 },
  { label: '2 Minutos', value: 120 },
  { label: '5 Minutos', value: 300 }
];

export default function App() {
  const [params, setParams] = useState<Omit<ExtractionParams, 'cities'>>({
    state: 'SP',
    type: 'Restaurante',
    size: 'Qualquer',
    priority: 'Nenhuma',
  });
  
  const [cities, setCities] = useState<CityConfig[]>([{ name: 'São Paulo', timeLimit: 60 }]);
  const [citiesForState, setCitiesForState] = useState<string[]>([]);
  const [activeCityIndex, setActiveCityIndex] = useState<number | null>(null);

  const [minResults, setMinResults] = useState<number | ''>('');
  const [maxRetries, setMaxRetries] = useState<number>(1);
  const [cityStats, setCityStats] = useState<Record<string, { status: 'idle'|'running'|'done', elapsed: number, count: number }>>({});

  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentExtractingCity, setCurrentExtractingCity] = useState<string | null>(null);
  const [results, setResults] = useState<Restaurant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchReason, setSearchReason] = useState<string | null>(null);

  const controlRef = useRef({ abort: false, timeUp: false });
  const timerRef = useRef<NodeJS.Timeout | null>(null);

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

  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validar todas as cidades
    for (const city of cities) {
      if (!city.name || !citiesForState.includes(city.name)) {
        setError(`A cidade "${city.name}" não foi encontrada no estado ${params.state}. Por favor, selecione uma cidade válida na lista.`);
        return;
      }
    }

    setIsLoading(true);
    setError(null);
    setSearchReason(null);
    setResults([]);
    setProgress(0);
    
    controlRef.current = { abort: false, timeUp: false };
    let allResults: Restaurant[] = [];
    let finalReason = '';
    let attempt = 1;
    const maxAttempts = minResults ? maxRetries : 1;

    // Inicializa os status das cidades
    const initialStats: Record<string, any> = {};
    cities.forEach(c => initialStats[c.name] = { status: 'idle', elapsed: 0, count: 0 });
    setCityStats(initialStats);

    while (attempt <= maxAttempts) {
      for (let i = 0; i < cities.length; i++) {
        const city = cities[i];
        if (controlRef.current.abort) {
          finalReason = 'Busca interrompida pelo usuário.';
          break;
        }

        setCurrentExtractingCity(city.name);
        setCityStats(prev => ({ ...prev, [city.name]: { ...prev[city.name], status: 'running', elapsed: 0 } }));
        
        const startTime = Date.now();
        const progressInterval = setInterval(() => {
          setCityStats(prev => ({
            ...prev,
            [city.name]: { ...prev[city.name], elapsed: Date.now() - startTime }
          }));
        }, 100);
        
        controlRef.current.timeUp = false;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          controlRef.current.timeUp = true;
        }, city.timeLimit * 1000);

        try {
          const existingForCity = allResults.filter(r => r.city === city.name).map(r => r.name);
          const res = await extractRestaurants(
            { state: params.state, city: city.name, type: params.type, size: params.size, priority: params.priority, existingNames: existingForCity }, 
            controlRef.current,
            (count) => setProgress(allResults.length + count)
          );
          
          // Evitar duplicatas (mesmo nome e cidade)
          const newResults = res.data.filter(newItem => 
            !allResults.some(existing => existing.name === newItem.name && existing.city === newItem.city)
          );
          allResults = [...allResults, ...newResults];
          setResults(allResults);
          setProgress(allResults.length);
          
          setCityStats(prev => ({
            ...prev,
            [city.name]: { 
              status: 'done', 
              elapsed: city.timeLimit * 1000, 
              count: allResults.filter(r => r.city === city.name).length 
            }
          }));

          finalReason = res.reason;
        } catch (err: any) {
          console.error(`Erro na cidade ${city.name}:`, err);
        } finally {
          clearInterval(progressInterval);
        }
      }

      if (controlRef.current.abort) {
        finalReason = 'Busca interrompida pelo usuário.';
        break;
      }

      if (minResults && allResults.length >= minResults) {
        finalReason = `Busca concluída. Meta de ${minResults} resultados atingida!`;
        break;
      }

      attempt++;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    setIsLoading(false);
    setCurrentExtractingCity(null);
    
    if (controlRef.current.abort) {
      setSearchReason('Busca interrompida pelo usuário.');
    } else if (minResults && allResults.length < minResults) {
      setSearchReason(`Busca concluída. Foram feitas ${maxAttempts} tentativas, mas não foi possível atingir a meta de ${minResults} resultados.`);
    } else {
      setSearchReason(finalReason || 'Busca concluída em todas as cidades selecionadas.');
    }
  };

  const handleStop = () => {
    controlRef.current.abort = true;
  };

  const handleClear = () => {
    setResults([]);
    setError(null);
    setSearchReason(null);
    setProgress(0);
  };

  const handleDownload = () => {
    if (results.length === 0) return;
    const filename = `extracao_${params.type.toLowerCase()}_${new Date().getTime()}.xlsx`;
    exportToExcel(results, filename, params.priority);
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-stone-800 font-sans selection:bg-orange-200">
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
        <div className="max-w-3xl">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-stone-900 mb-4">
            Encontre contatos de estabelecimentos em segundos.
          </h2>
          <p className="text-lg text-stone-500">
            Configure os parâmetros abaixo e nossa IA irá extrair uma lista estruturada de restaurantes, quiosques, pizzarias e muito mais, pronta para download.
          </p>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-stone-200/60"
        >
          <form onSubmit={handleExtract} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
                  <Map size={16} className="text-stone-400" />
                  Estado
                </label>
                <select 
                  value={params.state}
                  onChange={(e) => {
                    setParams({...params, state: e.target.value});
                    setCities([{ name: '', timeLimit: 60 }]);
                  }}
                  className="w-full h-11 px-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
                >
                  {STATES.map(state => <option key={state} value={state}>{state}</option>)}
                </select>
              </div>

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

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
                  <Star size={16} className="text-stone-400" />
                  Prioridade
                </label>
                <select 
                  value={params.priority}
                  onChange={(e) => setParams({...params, priority: e.target.value as Priority})}
                  className="w-full h-11 px-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
                >
                  {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
                  <Target size={16} className="text-stone-400" />
                  Meta Mínima (Opcional)
                </label>
                <input 
                  type="number"
                  min="1"
                  value={minResults}
                  onChange={(e) => setMinResults(e.target.value ? parseInt(e.target.value) : '')}
                  placeholder="Ex: 50"
                  className="w-full h-11 px-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
                  <RefreshCw size={16} className="text-stone-400" />
                  Máx. Tentativas
                </label>
                <input 
                  type="number"
                  min="1"
                  max="5"
                  value={maxRetries}
                  onChange={(e) => setMaxRetries(parseInt(e.target.value) || 1)}
                  disabled={!minResults}
                  className="w-full h-11 px-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all disabled:opacity-50"
                />
              </div>

              <div className="col-span-1 sm:col-span-2 lg:col-span-4 space-y-4 pt-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
                    <MapPin size={16} className="text-stone-400" />
                    Cidades (até 5)
                  </label>
                  {cities.length < 5 && (
                    <button 
                      type="button" 
                      onClick={() => setCities([...cities, { name: '', timeLimit: 60 }])}
                      className="text-sm text-orange-600 font-medium hover:text-orange-700 transition-colors flex items-center gap-1"
                    >
                      <Plus size={16} /> Adicionar Cidade
                    </button>
                  )}
                </div>
                
                <div className="space-y-4">
                  {cities.map((city, idx) => {
                    const stats = cityStats[city.name];
                    return (
                      <div key={idx} className="flex flex-col gap-2 relative">
                        <div className="flex gap-3 items-start">
                          <div className="flex-1 relative">
                            <input 
                              type="text"
                              required
                              value={city.name}
                              onChange={(e) => {
                                const newCities = [...cities];
                                newCities[idx].name = e.target.value;
                                setCities(newCities);
                                setActiveCityIndex(idx);
                              }}
                              onFocus={() => setActiveCityIndex(idx)}
                              onBlur={() => setTimeout(() => setActiveCityIndex(null), 200)}
                              placeholder={`Nome da cidade ${idx + 1}...`}
                              className="w-full h-11 px-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
                            />
                            
                            {activeCityIndex === idx && city.name.length >= 3 && (
                              <ul className="absolute z-50 w-full mt-1 bg-white border border-stone-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                                {citiesForState.filter(c => c.toLowerCase().startsWith(city.name.toLowerCase())).map(c => (
                                  <li 
                                    key={c}
                                    onClick={() => {
                                      const newCities = [...cities];
                                      newCities[idx].name = c;
                                      setCities(newCities);
                                      setActiveCityIndex(null);
                                    }}
                                    className="px-4 py-2 hover:bg-orange-50 cursor-pointer text-sm text-stone-700 transition-colors"
                                  >
                                    {c}
                                  </li>
                                ))}
                                {citiesForState.filter(c => c.toLowerCase().startsWith(city.name.toLowerCase())).length === 0 && (
                                  <li className="px-4 py-3 text-sm text-stone-500 text-center">
                                    Nenhuma cidade encontrada
                                  </li>
                                )}
                              </ul>
                            )}
                          </div>
                          
                          <div className="w-40 shrink-0">
                            <select 
                              value={city.timeLimit}
                              onChange={(e) => {
                                const newCities = [...cities];
                                newCities[idx].timeLimit = parseInt(e.target.value);
                                setCities(newCities);
                              }}
                              className="w-full h-11 px-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
                            >
                              {TIME_LIMITS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                          </div>

                          {cities.length > 1 && (
                            <button 
                              type="button" 
                              onClick={() => {
                                const newCities = cities.filter((_, i) => i !== idx);
                                setCities(newCities);
                              }}
                              className="h-11 px-3 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors shrink-0 flex items-center justify-center"
                            >
                              <Trash2 size={20} />
                            </button>
                          )}
                        </div>

                        {stats && stats.status !== 'idle' && (
                          <div className="flex items-center gap-3 text-xs px-1">
                            {stats.status === 'running' && (
                              <div className="flex-1 h-1.5 bg-stone-200 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-orange-500 transition-all duration-100"
                                  style={{ width: `${Math.min(100, (stats.elapsed / (city.timeLimit * 1000)) * 100)}%` }}
                                />
                              </div>
                            )}
                            <span className={stats.status === 'done' ? 'text-emerald-600 font-medium' : 'text-stone-500 font-medium'}>
                              {stats.status === 'done' ? `✓ ${stats.count} resultados encontrados` : `${Math.floor(stats.elapsed / 1000)}s / ${city.timeLimit}s`}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="pt-4 flex items-center justify-end border-t border-stone-100 gap-3">
              {isLoading && (
                <button 
                  type="button"
                  onClick={handleStop}
                  className="h-12 px-6 bg-red-100 hover:bg-red-200 text-red-700 rounded-xl font-medium flex items-center gap-2 transition-colors"
                >
                  <StopCircle size={18} />
                  Parar Busca
                </button>
              )}
              <button 
                type="submit" 
                disabled={isLoading}
                className="h-12 px-6 bg-stone-900 hover:bg-stone-800 text-white rounded-xl font-medium flex items-center gap-2 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Buscando em {currentExtractingCity}... ({progress} encontrados)
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

        {searchReason && !isLoading && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-orange-50 text-orange-800 p-4 rounded-2xl flex items-start gap-3 border border-orange-100"
          >
            <AlertCircle className="shrink-0 mt-0.5" size={20} />
            <p>{searchReason}</p>
          </motion.div>
        )}

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
                  className="h-11 px-5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white rounded-xl font-medium flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95"
                >
                  <Download size={18} />
                  Baixar Excel
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
                      {params.priority !== 'Email' && <th className="px-6 py-4 whitespace-nowrap">Telefone/WhatsApp</th>}
                      {params.priority !== 'WhatsApp' && params.priority !== 'Telefone' && <th className="px-6 py-4 whitespace-nowrap">Email</th>}
                      <th className="px-6 py-4 whitespace-nowrap">Tipo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {results.map((item, idx) => (
                      <tr key={idx} className="hover:bg-stone-50/50 transition-colors text-sm text-stone-700">
                        <td className="px-6 py-4 font-medium text-stone-900">{item.name}</td>
                        <td className="px-6 py-4">{item.city}</td>
                        {params.priority !== 'Email' && <td className="px-6 py-4">{item.phone || '-'}</td>}
                        {params.priority !== 'WhatsApp' && params.priority !== 'Telefone' && <td className="px-6 py-4 text-stone-500">{item.email || '-'}</td>}
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
