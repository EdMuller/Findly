export interface Restaurant {
  name: string;
  city: string;
  phone: string;
  email: string;
  type: string;
}

export interface ExtractionParams {
  state: string;
  city: string;
  type: string;
  quantity: number;
  size: string;
}
