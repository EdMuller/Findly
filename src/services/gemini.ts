import { GoogleGenAI, Type } from '@google/genai';
import { ExtractionParams, Restaurant } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function extractRestaurants(params: ExtractionParams): Promise<Restaurant[]> {
  const prompt = `Você é um assistente especializado em mineração de dados comerciais REAIS.
O usuário precisa de uma lista de ${params.quantity} estabelecimentos do tipo "${params.type}" (porte: ${params.size}) localizados na cidade de ${params.city}, estado de ${params.state}, Brasil.

ATENÇÃO - REGRA DE OURO: TODOS os dados fornecidos DEVEM SER ESTRITAMENTE REAIS e extraídos de fontes públicas seguras. NUNCA invente, alucine, adivinhe ou crie dados fictícios. 
Se você não souber o telefone ou o email real e exato de um estabelecimento, você DEVE deixar o campo vazio (""). É preferível um campo vazio do que um dado inventado.

Para cada um, forneça:
- Nome do estabelecimento (Nome real)
- Cidade
- Telefone ou WhatsApp (Apenas se souber o real. Formato: (11) 99999-9999. Se não souber, retorne "")
- Email (Apenas se souber o real. NUNCA invente emails como "contato@...". Se não souber, retorne "")
- Tipo (ex: Pizzaria, Quiosque, Restaurante)

Retorne EXATAMENTE ${params.quantity} resultados.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: "Nome do estabelecimento" },
              city: { type: Type.STRING, description: "Cidade onde está localizado" },
              phone: { type: Type.STRING, description: "Telefone ou WhatsApp" },
              email: { type: Type.STRING, description: "Email de contato" },
              type: { type: Type.STRING, description: "Tipo de estabelecimento" }
            },
            required: ["name", "city", "phone", "email", "type"]
          }
        }
      }
    });

    if (!response.text) {
      throw new Error("Nenhum dado retornado pela IA.");
    }

    const data = JSON.parse(response.text);
    return data;
  } catch (error) {
    console.error("Erro ao extrair dados:", error);
    throw new Error("Falha ao extrair os dados. Por favor, tente novamente.");
  }
}
