import { Restaurant } from '../types';

export function exportToCSV(data: Restaurant[], filename: string = 'restaurantes.csv') {
  const headers = ['Nome', 'Cidade', 'Telefone/WhatsApp', 'Email', 'Tipo'];
  
  const rows = data.map(item => [
    `"${(item.name || '').replace(/"/g, '""')}"`,
    `"${(item.city || '').replace(/"/g, '""')}"`,
    `"${(item.phone || '').replace(/"/g, '""')}"`,
    `"${(item.email || '').replace(/"/g, '""')}"`,
    `"${(item.type || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  // Add BOM for Excel UTF-8 compatibility
  const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
