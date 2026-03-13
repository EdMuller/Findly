export interface Restaurant {
  name: string;
  city: string;
  phone: string;
  email: string;
  type: string;
}

export type Priority = 'Nenhuma' | 'Telefone' | 'WhatsApp' | 'Email';

export interface ExtractionParams {
  state: string;
  city: string;
  type: string;
  quantity: number;
  size: string;
  priority: Priority;
  timeLimit: number;
}

export interface ExtractionResult {
  data: Restaurant[];
  reason: string;
}
