const ExcelJS = require('exceljs');

function addWorksheet(workbook, sheetName, columns, rows) {
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns;
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  rows.forEach((row) => sheet.addRow(row));
  return sheet;
}

async function exportWorkbook(sheetName, columns, rows) {
  const workbook = new ExcelJS.Workbook();
  addWorksheet(workbook, sheetName, columns, rows);
  return workbook.xlsx.writeBuffer();
}

async function exportWorkbookSheets(sheets = []) {
  const workbook = new ExcelJS.Workbook();
  sheets.forEach((sheet) => addWorksheet(workbook, sheet.name, sheet.columns, sheet.rows || []));
  return workbook.xlsx.writeBuffer();
}

module.exports = { exportWorkbook, exportWorkbookSheets };
