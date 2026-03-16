import * as XLSX from 'xlsx';
import { Restaurant, Priority } from '../types';

export function exportToExcel(data: Restaurant[], filename: string, priority: Priority) {
  const filteredData = data.map(item => {
    const row: any = {
      'Nome': item.name,
      'Cidade': item.city,
      'Tipo': item.type,
    };
    
    if (priority === 'WhatsApp' || priority === 'Telefone') {
      row['Telefone/WhatsApp'] = item.phone || '-';
    } else if (priority === 'Email') {
      row['Email'] = item.email || '-';
    } else {
      row['Telefone/WhatsApp'] = item.phone || '-';
      row['Email'] = item.email || '-';
    }
    
    return row;
  });

  const worksheet = XLSX.utils.json_to_sheet(filteredData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Resultados");
  XLSX.writeFile(workbook, filename);
}
