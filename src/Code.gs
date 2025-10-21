const SHEET_NAMES = Object.freeze({
  TRANSACTIONS: 'Transacciones',
  BUDGETS: 'Presupuestos',
  ACCOUNTS: 'Cuentas',
  CATEGORIES: 'Categorias'
});

const TRANSACTION_HEADERS = ['Fecha', 'Tipo', 'Categoria', 'Cuenta', 'Monto', 'Notas'];
const BUDGET_HEADERS = ['Mes', 'Categoria', 'MontoPlanificado', 'MontoGastado', 'Notas'];
const ACCOUNT_HEADERS = ['Nombre', 'SaldoInicial'];

function doGet(e) {
  var page = e && e.parameter && e.parameter.page ? e.parameter.page : 'index';
  var allowedPages = ['index', 'presupuesto', 'reportes'];
  if (allowedPages.indexOf(page) === -1) {
    page = 'index';
  }
  var template = HtmlService.createTemplateFromFile(page);
  template.currentPage = page;
  return template
    .evaluate()
    .setTitle('Fluye - Finanzas Personales')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getDashboardData() {
  var transactions = getTransactions_();
  var accounts = getAccounts_();
  var budgets = getBudgets_();

  var balance = accounts.reduce(function (acc, account) {
    return acc + account.balance;
  }, 0);

  var incomeTotal = 0;
  var expenseTotal = 0;
  var transferTotal = 0;
  var groupedByAccount = {};

  transactions.forEach(function (tx) {
    if (tx.type === 'Ingreso') {
      incomeTotal += tx.amount;
    } else if (tx.type === 'Gasto') {
      expenseTotal += tx.amount;
    } else if (tx.type === 'Transferencia') {
      transferTotal += tx.amount;
    }

    if (!groupedByAccount[tx.account]) {
      groupedByAccount[tx.account] = 0;
    }
    groupedByAccount[tx.account] += tx.type === 'Gasto' ? -tx.amount : tx.amount;
  });

  var recentTransactions = transactions
    .slice()
    .sort(function (a, b) {
      return b.date - a.date;
    })
    .slice(0, 5)
    .map(function (tx) {
      return {
        date: Utilities.formatDate(tx.date, Session.getScriptTimeZone(), 'd MMM'),
        type: tx.type,
        category: tx.category,
        account: tx.account,
        amount: tx.amount,
        sign: tx.type === 'Gasto' ? '-' : '+'
      };
    });

  var budgetsSummary = budgets.map(function (budget) {
    var monthKey = Utilities.formatDate(budget.month, Session.getScriptTimeZone(), 'yyyy-MM');
    var spent = transactions
      .filter(function (tx) {
        return (
          tx.type === 'Gasto' &&
          tx.category === budget.category &&
          Utilities.formatDate(tx.date, Session.getScriptTimeZone(), 'yyyy-MM') === monthKey
        );
      })
      .reduce(function (acc, tx) {
        return acc + tx.amount;
      }, 0);

    var progress = budget.planned > 0 ? Math.min((spent / budget.planned) * 100, 100) : 0;

    return {
      monthLabel: formatMonthLabel_(budget.month, true),
      category: budget.category,
      planned: budget.planned,
      spent: spent,
      progress: Math.round(progress)
    };
  });

  return {
    balanceTotal: balance,
    incomeTotal: incomeTotal,
    expenseTotal: expenseTotal,
    transferTotal: transferTotal,
    accounts: accounts,
    groupedByAccount: groupedByAccount,
    recentTransactions: recentTransactions,
    budgets: budgetsSummary
  };
}

function getBudgetsData() {
  var transactions = getTransactions_();
  var budgets = getBudgets_();

  var groupedBudgets = budgets.reduce(function (acc, budget) {
    var key = Utilities.formatDate(budget.month, Session.getScriptTimeZone(), 'yyyy-MM') + '|' + budget.category;
    acc[key] = budget;
    return acc;
  }, {});

  Object.keys(groupedBudgets).forEach(function (key) {
    var budget = groupedBudgets[key];
    var monthKey = Utilities.formatDate(budget.month, Session.getScriptTimeZone(), 'yyyy-MM');
    var spent = transactions
      .filter(function (tx) {
        return (
          tx.type === 'Gasto' &&
          tx.category === budget.category &&
          Utilities.formatDate(tx.date, Session.getScriptTimeZone(), 'yyyy-MM') === monthKey
        );
      })
      .reduce(function (total, tx) {
        return total + tx.amount;
      }, 0);

    budget.spent = spent;
    budget.remaining = budget.planned - spent;
    budget.progress = budget.planned > 0 ? Math.min((spent / budget.planned) * 100, 100) : 0;
  });

  return Object.keys(groupedBudgets)
    .map(function (key) {
      var budget = groupedBudgets[key];
      return {
        monthDate: new Date(budget.month),
        monthLabel: formatMonthLabel_(budget.month, true),
        category: budget.category,
        planned: budget.planned,
        spent: budget.spent,
        remaining: budget.remaining,
        progress: Math.round(budget.progress)
      };
    })
    .sort(function (a, b) {
      return b.monthDate - a.monthDate;
    })
    .map(function (budget) {
      delete budget.monthDate;
      return budget;
    });
}

function getReportsData() {
  var transactions = getTransactions_();

  var monthlySummary = {};
  var categorySummary = {};
  var accountSummary = {};

  transactions.forEach(function (tx) {
    var monthKey = Utilities.formatDate(tx.date, Session.getScriptTimeZone(), 'yyyy-MM');
    if (!monthlySummary[monthKey]) {
      monthlySummary[monthKey] = { income: 0, expense: 0, transfer: 0 };
    }
    if (!categorySummary[tx.category]) {
      categorySummary[tx.category] = 0;
    }
    if (!accountSummary[tx.account]) {
      accountSummary[tx.account] = 0;
    }

    if (tx.type === 'Ingreso') {
      monthlySummary[monthKey].income += tx.amount;
      accountSummary[tx.account] += tx.amount;
    } else if (tx.type === 'Gasto') {
      monthlySummary[monthKey].expense += tx.amount;
      categorySummary[tx.category] += tx.amount;
      accountSummary[tx.account] -= tx.amount;
    } else if (tx.type === 'Transferencia') {
      monthlySummary[monthKey].transfer += tx.amount;
    }
  });

  var monthlySeries = Object.keys(monthlySummary)
    .sort()
    .map(function (key) {
      var parts = key.split('-');
      var monthDate = new Date(parts[0], parts[1] - 1, 1);
      return {
        label: formatMonthLabel_(monthDate, false),
        income: monthlySummary[key].income,
        expense: monthlySummary[key].expense,
        transfer: monthlySummary[key].transfer
      };
    });

  var categorySeries = Object.keys(categorySummary)
    .map(function (key) {
      return {
        category: key,
        amount: categorySummary[key]
      };
    })
    .sort(function (a, b) {
      return b.amount - a.amount;
    });

  var accountSeries = Object.keys(accountSummary)
    .map(function (key) {
      return {
        account: key,
        balance: accountSummary[key]
      };
    });

  return {
    monthly: monthlySeries,
    categories: categorySeries,
    accounts: accountSeries
  };
}

function addTransaction(transaction) {
  var sheet = getOrCreateSheet_(SHEET_NAMES.TRANSACTIONS, TRANSACTION_HEADERS);
  var row = [
    transaction.date ? new Date(transaction.date) : new Date(),
    transaction.type,
    transaction.category,
    transaction.account,
    Number(transaction.amount),
    transaction.notes || ''
  ];

  sheet.appendRow(row);
  return { success: true };
}

function addBudget(budget) {
  var sheet = getOrCreateSheet_(SHEET_NAMES.BUDGETS, BUDGET_HEADERS);
  var row = [
    budget.month ? new Date(budget.month) : new Date(),
    budget.category,
    Number(budget.planned),
    Number(budget.spent || 0),
    budget.notes || ''
  ];

  sheet.appendRow(row);
  return { success: true };
}

function getSupportData() {
  return {
    accounts: getAccounts_(),
    categories: getCategories_()
  };
}

function getTransactions_() {
  var sheet = getOrCreateSheet_(SHEET_NAMES.TRANSACTIONS, TRANSACTION_HEADERS);
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) {
    return [];
  }
  var headers = values.shift();
  return values
    .filter(function (row) {
      return row.join('').trim() !== '';
    })
    .map(function (row) {
      return {
        date: row[headers.indexOf('Fecha')] instanceof Date ? row[headers.indexOf('Fecha')] : new Date(row[headers.indexOf('Fecha')]),
        type: row[headers.indexOf('Tipo')] || 'Gasto',
        category: row[headers.indexOf('Categoria')] || 'Sin categoría',
        account: row[headers.indexOf('Cuenta')] || 'General',
        amount: Number(row[headers.indexOf('Monto')]) || 0,
        notes: row[headers.indexOf('Notas')] || ''
      };
    });
}

function getBudgets_() {
  var sheet = getOrCreateSheet_(SHEET_NAMES.BUDGETS, BUDGET_HEADERS);
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) {
    return [];
  }
  var headers = values.shift();
  return values
    .filter(function (row) {
      return row.join('').trim() !== '';
    })
    .map(function (row) {
      return {
        month: row[headers.indexOf('Mes')] instanceof Date ? row[headers.indexOf('Mes')] : new Date(row[headers.indexOf('Mes')]),
        category: row[headers.indexOf('Categoria')] || 'General',
        planned: Number(row[headers.indexOf('MontoPlanificado')]) || 0,
        spent: Number(row[headers.indexOf('MontoGastado')]) || 0,
        notes: row[headers.indexOf('Notas')] || ''
      };
    });
}

function getAccounts_() {
  var sheet = getOrCreateSheet_(SHEET_NAMES.ACCOUNTS, ACCOUNT_HEADERS);
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) {
    return [];
  }
  var headers = values.shift();
  return values
    .filter(function (row) {
      return row.join('').trim() !== '';
    })
    .map(function (row) {
      return {
        name: row[headers.indexOf('Nombre')] || 'Cuenta',
        balance: Number(row[headers.indexOf('SaldoInicial')]) || 0
      };
    });
}

function getCategories_() {
  var sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.CATEGORIES);
  if (!sheet) {
    return ['Salario', 'Comida', 'Transporte', 'Vivienda', 'Entretenimiento'];
  }
  var values = sheet.getDataRange().getValues();
  if (values.length === 0) {
    return [];
  }
  return values
    .map(function (row) {
      return row[0];
    })
    .filter(function (item) {
      return item;
    });
}

function getOrCreateSheet_(name, headers) {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function formatMonthLabel_(date, longForm) {
  if (!(date instanceof Date)) {
    date = new Date(date);
  }
  var monthsLong = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var monthsShort = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var months = longForm ? monthsLong : monthsShort;
  var monthName = months[date.getMonth()] || '';
  monthName = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  return monthName + ' ' + date.getFullYear();
}
