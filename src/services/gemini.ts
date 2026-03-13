import { GoogleGenAI } from '@google/genai';
import { ExtractionParams, Restaurant, ExtractionResult } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function extractRestaurants(
  params: ExtractionParams,
  control: { abort: boolean; timeUp: boolean },
  onProgress?: (count: number) => void
): Promise<ExtractionResult> {
  const targetQuantity = params.quantity;
  // Pedimos um pouco mais para compensar os que serão filtrados pela prioridade,
  // mas limitamos a 150 para não sobrecarregar a IA e evitar recusas ou alucinações.
  const requestQuantity = Math.min(targetQuantity * 2, 150); 

  const prompt = `Você é um assistente especializado em mineração de dados comerciais REAIS.
O usuário precisa de estabelecimentos do tipo "${params.type}" (porte: ${params.size}) localizados na cidade de ${params.city}, estado de ${params.state}, Brasil.

ATENÇÃO - REGRAS DE OURO:
1. TODOS os dados DEVEM SER ESTRITAMENTE REAIS. NUNCA invente, alucine ou crie dados fictícios.
2. Se não souber o telefone ou email real, DEIXE VAZIO ("").
3. NUNCA adicione texto explicativo, introduções ou pedidos de desculpas.
4. Se você não conhecer ${requestQuantity} estabelecimentos reais, retorne APENAS os que você tem certeza absoluta.

A prioridade do usuário é obter estabelecimentos que tenham: ${params.priority !== 'Nenhuma' ? params.priority : 'Qualquer dado'}.

FORMATO DE SAÍDA OBRIGATÓRIO:
APENAS objetos JSON, UM POR LINHA (JSONL). Sem blocos markdown (\`\`\`), sem colchetes de array [].
Exemplo exato:
{"name": "Restaurante Exemplo", "city": "São Paulo", "phone": "(11) 99999-9999", "email": "contato@exemplo.com.br", "type": "Restaurante"}
{"name": "Outro Local", "city": "São Paulo", "phone": "", "email": "", "type": "Restaurante"}

Gere o máximo de resultados reais que conseguir (limite de ${requestQuantity}).`;

  let results: Restaurant[] = [];
  let buffer = '';
  let reason = '';

  try {
    const stream = await ai.models.generateContentStream({
      model: 'gemini-3.1-pro-preview',
      contents: prompt,
    });

    for await (const chunk of stream) {
      if (control.abort) {
        reason = 'Busca interrompida pelo usuário.';
        break;
      }
      if (control.timeUp) {
        reason = 'Listagem interrompida devido ao limite de tempo.';
        break;
      }

      buffer += chunk.text;
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Mantém a última linha incompleta no buffer

      for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        if (line.startsWith('```')) continue; // Ignora marcadores markdown
        if (line === '[' || line === ']') continue; // Ignora colchetes se a IA errar o formato
        
        // Remove vírgula no final se a IA formatar como array tradicional
        if (line.endsWith(',')) {
          line = line.slice(0, -1);
        }

        try {
          const item = JSON.parse(line) as Restaurant;
          
          if (item.name && item.city) {
            let isValid = false;
            const phone = item.phone || '';
            const email = item.email || '';

            if (params.priority === 'WhatsApp') {
              const digits = phone.replace(/\D/g, '');
              if (digits.length === 11 && digits.charAt(2) === '9') {
                isValid = true;
              }
            } else if (params.priority === 'Telefone') {
              if (phone.length > 5) isValid = true;
            } else if (params.priority === 'Email') {
              if (email.includes('@')) isValid = true;
            } else {
              isValid = true;
            }

            if (isValid) {
              if (!results.some(r => r.name === item.name)) {
                results.push(item);
                if (onProgress) onProgress(results.length);
              }
            }
          }
        } catch (e) {
          // Ignora erros de parse em linhas mal formatadas
        }

        if (results.length >= targetQuantity) {
          reason = 'Busca concluída com sucesso.';
          break;
        }
      }

      if (results.length >= targetQuantity) {
        break;
      }
    }

    // Tenta processar o que sobrou no buffer no final
    if (buffer.trim() && results.length < targetQuantity && !control.abort && !control.timeUp) {
      let line = buffer.trim();
      if (line.endsWith(',')) line = line.slice(0, -1);
      try {
        const item = JSON.parse(line) as Restaurant;
        if (item.name && item.city && !results.some(r => r.name === item.name)) {
          results.push(item);
          if (onProgress) onProgress(results.length);
        }
      } catch(e) {}
    }

    if (!reason) {
      if (results.length < targetQuantity) {
        reason = `Não existem ${targetQuantity} estabelecimentos com as características selecionadas disponíveis para listagem. Foram encontrados ${results.length}.`;
      } else {
        reason = 'Busca concluída com sucesso.';
      }
    }

    return { data: results, reason };

  } catch (error: any) {
    console.error("Erro ao extrair dados:", error);
    if (control.abort) {
      return { data: results, reason: 'Busca interrompida pelo usuário.' };
    }
    if (control.timeUp) {
      return { data: results, reason: 'Listagem interrompida devido ao limite de tempo.' };
    }
    throw new Error("Falha ao extrair os dados. Por favor, tente novamente.");
  }
}
