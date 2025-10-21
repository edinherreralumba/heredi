(function () {
  const body = document.body;
  if (!body) {
    return;
  }

  const page = body.dataset.page || 'index';
  const isAppsScript = typeof google !== 'undefined' && google.script && google.script.run;
  const state = {
    supportLoaded: false,
    accounts: [],
    categories: []
  };

  highlightNavigation();

  if (page === 'index') {
    initDashboard();
  } else if (page === 'presupuesto') {
    initBudgets();
  } else if (page === 'reportes') {
    initReports();
  }

  function highlightNavigation() {
    const active = page;
    document.querySelectorAll('.bottom-nav__link').forEach((link) => {
      if (link.dataset.nav === active) {
        link.classList.add('is-active');
      }
    });
  }

  function initDashboard() {
    const modal = createModal('transactionModal');
    const quickButtons = document.querySelectorAll('.quick-action');
    const transactionForm = document.getElementById('transactionForm');
    const refreshButton = document.getElementById('refreshDashboard');

    loadSupportData().then(populateTransactionSelects);
    loadDashboardData();

    quickButtons.forEach((button) => {
      button.addEventListener('click', () => {
        if (button.dataset.accounts !== undefined) {
          const accountsList = document.getElementById('accountsList');
          if (accountsList) {
            accountsList.scrollIntoView({ behavior: 'smooth', block: 'center' });
            accountsList.classList.add('highlight');
            setTimeout(() => accountsList.classList.remove('highlight'), 1200);
          }
          return;
        }

        const type = button.dataset.quick;
        if (!modal) return;
        modal.open();
        const typeSelect = document.getElementById('transactionType');
        if (typeSelect && type) {
          typeSelect.value = type;
        }
        const dateField = document.getElementById('transactionDate');
        if (dateField && !dateField.value) {
          dateField.valueAsDate = new Date();
        }
        const amountField = document.getElementById('transactionAmount');
        if (amountField) {
          amountField.focus();
        }
      });
    });

    if (transactionForm) {
      transactionForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const formData = new FormData(transactionForm);
        const payload = Object.fromEntries(formData.entries());
        payload.amount = Number(payload.amount);
        if (!payload.date) {
          payload.date = new Date().toISOString().substring(0, 10);
        }
        if (!isAppsScript) {
          console.warn('google.script.run no disponible en modo local.');
          modal && modal.close();
          transactionForm.reset();
          return;
        }
        setLoading(transactionForm, true);
        google.script.run
          .withSuccessHandler(() => {
            transactionForm.reset();
            setLoading(transactionForm, false);
            modal && modal.close();
            loadDashboardData();
          })
          .withFailureHandler((error) => {
            console.error(error);
            setLoading(transactionForm, false);
          })
          .addTransaction(payload);
      });
    }

    if (refreshButton) {
      refreshButton.addEventListener('click', loadDashboardData);
    }
  }

  function initBudgets() {
    const modal = createModal('budgetModal');
    const openButton = document.getElementById('openBudgetModal');
    const budgetForm = document.getElementById('budgetForm');

    loadSupportData().then(populateBudgetSelects);
    loadBudgetsData();

    if (openButton) {
      openButton.addEventListener('click', () => modal && modal.open());
    }

    if (budgetForm) {
      budgetForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const formData = new FormData(budgetForm);
        const payload = Object.fromEntries(formData.entries());
        if (!payload.month) {
          const today = new Date();
          payload.month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        }
        payload.planned = Number(payload.planned);
        if (!isAppsScript) {
          console.warn('google.script.run no disponible en modo local.');
          modal && modal.close();
          budgetForm.reset();
          return;
        }
        setLoading(budgetForm, true);
        google.script.run
          .withSuccessHandler(() => {
            budgetForm.reset();
            setLoading(budgetForm, false);
            modal && modal.close();
            loadBudgetsData();
          })
          .withFailureHandler((error) => {
            console.error(error);
            setLoading(budgetForm, false);
          })
          .addBudget(payload);
      });
    }
  }

  function initReports() {
    const refreshButton = document.getElementById('refreshReports');
    loadReportsData();
    setupCalculators();
    if (refreshButton) {
      refreshButton.addEventListener('click', loadReportsData);
    }
  }

  function loadDashboardData() {
    if (!isAppsScript) {
      renderDashboard(mockDashboard());
      return;
    }
    google.script.run
      .withSuccessHandler(renderDashboard)
      .withFailureHandler((error) => console.error(error))
      .getDashboardData();
  }

  function loadBudgetsData() {
    if (!isAppsScript) {
      renderBudgets(mockBudgets());
      return;
    }
    google.script.run
      .withSuccessHandler(renderBudgets)
      .withFailureHandler((error) => console.error(error))
      .getBudgetsData();
  }

  function loadReportsData() {
    if (!isAppsScript) {
      renderReports(mockReports());
      return;
    }
    google.script.run
      .withSuccessHandler(renderReports)
      .withFailureHandler((error) => console.error(error))
      .getReportsData();
  }

  function loadSupportData() {
    if (state.supportLoaded) {
      return Promise.resolve({ accounts: state.accounts, categories: state.categories });
    }
    if (!isAppsScript) {
      const fallback = mockSupport();
      state.accounts = fallback.accounts;
      state.categories = fallback.categories;
      state.supportLoaded = true;
      return Promise.resolve(fallback);
    }
    return new Promise((resolve, reject) => {
      google.script.run
        .withSuccessHandler((data) => {
          state.accounts = data.accounts || [];
          state.categories = data.categories || [];
          state.supportLoaded = true;
          resolve(data);
        })
        .withFailureHandler((error) => {
          console.error(error);
          reject(error);
        })
        .getSupportData();
    });
  }

  function populateTransactionSelects() {
    const accountSelect = document.getElementById('transactionAccount');
    const categorySelect = document.getElementById('transactionCategory');
    if (accountSelect) {
      accountSelect.innerHTML = '';
      state.accounts.forEach((account) => {
        const option = document.createElement('option');
        option.value = account.name;
        option.textContent = account.name;
        accountSelect.appendChild(option);
      });
    }
    if (categorySelect) {
      categorySelect.innerHTML = '';
      state.categories.forEach((category) => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        categorySelect.appendChild(option);
      });
    }
  }

  function populateBudgetSelects() {
    const categorySelect = document.getElementById('budgetCategory');
    if (categorySelect) {
      categorySelect.innerHTML = '';
      state.categories.forEach((category) => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        categorySelect.appendChild(option);
      });
    }
  }

  function renderDashboard(data) {
    const balance = document.getElementById('balanceTotal');
    const income = document.getElementById('incomeTotal');
    const expense = document.getElementById('expenseTotal');
    const transfer = document.getElementById('transferTotal');
    const transactionsList = document.getElementById('recentTransactions');
    const budgetsPreview = document.getElementById('dashboardBudgets');
    const accountsList = document.getElementById('accountsList');

    if (balance) balance.textContent = formatCurrency(data.balanceTotal || 0);
    if (income) income.textContent = formatCurrency(data.incomeTotal || 0);
    if (expense) expense.textContent = formatCurrency(data.expenseTotal || 0);
    if (transfer) transfer.textContent = formatCurrency(data.transferTotal || 0);

    if (accountsList) {
      accountsList.innerHTML = '';
      const accounts = state.accounts.length ? state.accounts : data.accounts || [];
      if (!accounts.length) {
        accountsList.innerHTML = '<p class="empty-state">Aún no registras cuentas.</p>';
      } else {
        accounts.forEach((account) => {
          const effectiveBalance = account.balance + (data.groupedByAccount && data.groupedByAccount[account.name] ? data.groupedByAccount[account.name] : 0);
          const accountItem = document.createElement('div');
          accountItem.className = 'account-pill';
          accountItem.innerHTML = `
            <div class="account-pill__name">${account.name}</div>
            <div class="account-pill__balance">${formatCurrency(effectiveBalance)}</div>
          `;
          accountsList.appendChild(accountItem);
        });
      }
    }

    if (transactionsList) {
      transactionsList.innerHTML = '';
      if (!data.recentTransactions || !data.recentTransactions.length) {
        transactionsList.innerHTML = '<li class="empty-state">No hay movimientos recientes.</li>';
      } else {
        data.recentTransactions.forEach((tx) => {
          const item = document.createElement('li');
          item.className = 'transaction-item';
          const amountClass = tx.type === 'Gasto' ? '--expense' : '--income';
          item.innerHTML = `
            <div class="transaction-item__info">
              <strong>${tx.category}</strong>
              <div class="transaction-item__meta">
                <span>${tx.date}</span>
                <span>${tx.account}</span>
              </div>
            </div>
            <div class="transaction-item__amount ${amountClass}">${tx.sign}${formatCurrency(tx.amount)}</div>
          `;
          transactionsList.appendChild(item);
        });
      }
    }

    if (budgetsPreview) {
      budgetsPreview.innerHTML = '';
      if (!data.budgets || !data.budgets.length) {
        budgetsPreview.innerHTML = '<p class="empty-state">Activa tu primer presupuesto para seguirlo aquí.</p>';
      } else {
        data.budgets.slice(0, 3).forEach((budget) => {
          const wrapper = document.createElement('article');
          wrapper.className = 'budget-chip';
          wrapper.innerHTML = `
            <div class="budget-chip__header">
              <div>
                <strong>${budget.category}</strong>
                <p class="text-small">${budget.monthLabel}</p>
              </div>
              <span>${Math.min(budget.progress, 100)}%</span>
            </div>
            <div class="progress-bar"><div class="progress-bar__fill" style="width:${budget.progress}%"></div></div>
            <div class="budget-chip__footer">
              <span>${formatCurrency(budget.spent)} gastado</span>
              <span>${formatCurrency(budget.planned)} planificado</span>
            </div>
          `;
          budgetsPreview.appendChild(wrapper);
        });
      }
    }
  }

  function renderBudgets(data) {
    const container = document.getElementById('budgetsGrid');
    if (!container) return;
    container.innerHTML = '';
    if (!data.length) {
      container.innerHTML = '<p class="empty-state">Define categorías para controlar tus gastos mensuales.</p>';
      return;
    }
    data.forEach((budget) => {
      const card = document.createElement('article');
      card.className = 'budget-card';
      const remainingLabel = budget.remaining >= 0 ? 'Disponible' : 'Excedido';
      const badgeClass = budget.remaining >= 0 ? '--success' : '--danger';
      card.innerHTML = `
        <header class="budget-card__header">
          <div>
            <p class="text-small">${budget.monthLabel}</p>
            <h3 class="budget-card__category">${budget.category}</h3>
          </div>
          <span class="badge ${badgeClass}">${remainingLabel}</span>
        </header>
        <div class="budget-card__amounts">
          <span>Plan: ${formatCurrency(budget.planned)}</span>
          <span>Gastado: ${formatCurrency(budget.spent)}</span>
        </div>
        <div class="progress-bar"><div class="progress-bar__fill" style="width:${Math.min(budget.progress, 100)}%"></div></div>
        <p>${remainingLabel}: ${formatCurrency(budget.remaining)}</p>
      `;
      container.appendChild(card);
    });
  }

  function renderReports(data) {
    const monthlyTrend = document.getElementById('monthlyTrend');
    const categoryBreakdown = document.getElementById('categoryBreakdown');
    if (monthlyTrend) {
      monthlyTrend.innerHTML = '';
      if (!data.monthly.length) {
        monthlyTrend.innerHTML = '<p class="empty-state">Registra tus primeras transacciones para ver tendencias.</p>';
      } else {
        data.monthly.forEach((item) => {
          const row = document.createElement('div');
          row.className = 'data-row';
          row.innerHTML = `
            <div class="data-row__label">
              <strong>${item.label}</strong>
              <span>Transferencias: ${formatCurrency(item.transfer)}</span>
            </div>
            <div class="data-row__value">
              <span class="text-small ingreso">${formatCurrency(item.income)}</span>
              <span class="text-small gasto">${formatCurrency(item.expense)}</span>
            </div>
          `;
          monthlyTrend.appendChild(row);
        });
      }
    }

    if (categoryBreakdown) {
      categoryBreakdown.innerHTML = '';
      if (!data.categories.length) {
        categoryBreakdown.innerHTML = '<p class="empty-state">Tus categorías aparecerán cuando registres gastos.</p>';
      } else {
        data.categories.forEach((item) => {
          const row = document.createElement('div');
          row.className = 'data-row';
          row.innerHTML = `
            <div class="data-row__label">
              <strong>${item.category}</strong>
            </div>
            <div class="data-row__value gasto">${formatCurrency(item.amount)}</div>
          `;
          categoryBreakdown.appendChild(row);
        });
      }

      if (data.accounts && data.accounts.length) {
        const divider = document.createElement('hr');
        divider.className = 'card-divider';
        categoryBreakdown.appendChild(divider);
        data.accounts.forEach((account) => {
          const row = document.createElement('div');
          row.className = 'data-row';
          row.innerHTML = `
            <div class="data-row__label">
              <strong>${account.account}</strong>
            </div>
            <div class="data-row__value">${formatCurrency(account.balance)}</div>
          `;
          categoryBreakdown.appendChild(row);
        });
      }
    }
  }

  function setupCalculators() {
    const loanButton = document.getElementById('calculateLoan');
    const investmentButton = document.getElementById('calculateInvestment');

    if (loanButton) {
      loanButton.addEventListener('click', () => {
        const amount = Number(document.getElementById('loanAmount')?.value || 0);
        const rate = Number(document.getElementById('loanRate')?.value || 0);
        const term = Number(document.getElementById('loanTerm')?.value || 0);
        const result = document.getElementById('loanResult');
        if (!amount || !term) {
          result && (result.textContent = 'Completa los datos para calcular.');
          return;
        }
        const monthlyRate = rate ? rate / 100 / 12 : 0;
        let payment;
        if (monthlyRate === 0) {
          payment = amount / term;
        } else {
          payment = (amount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -term));
        }
        result && (result.textContent = `Cuota mensual: ${formatCurrency(payment)}`);
      });
    }

    if (investmentButton) {
      investmentButton.addEventListener('click', () => {
        const amount = Number(document.getElementById('investmentAmount')?.value || 0);
        const rate = Number(document.getElementById('investmentRate')?.value || 0);
        const years = Number(document.getElementById('investmentYears')?.value || 0);
        const result = document.getElementById('investmentResult');
        if (!amount || !years) {
          result && (result.textContent = 'Completa los datos para calcular.');
          return;
        }
        const months = years * 12;
        const monthlyRate = rate ? rate / 100 / 12 : 0;
        let futureValue;
        if (monthlyRate === 0) {
          futureValue = amount * months;
        } else {
          futureValue = amount * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);
        }
        result && (result.textContent = `Proyección: ${formatCurrency(futureValue)}`);
      });
    }
  }

  function createModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return null;
    const closeElements = modal.querySelectorAll('[data-dismiss]');
    closeElements.forEach((el) => el.addEventListener('click', () => modal.classList.remove('is-open')));
    return {
      open() {
        modal.classList.add('is-open');
      },
      close() {
        modal.classList.remove('is-open');
      }
    };
  }

  function setLoading(form, loading) {
    const button = form.querySelector('button[type="submit"]');
    if (button) {
      button.disabled = loading;
      button.textContent = loading ? 'Guardando...' : 'Guardar';
    }
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
      minimumFractionDigits: 2
    }).format(Number(value) || 0);
  }

  /* Mock helpers when running outside de Apps Script */
  function mockDashboard() {
    return {
      balanceTotal: 4250.75,
      incomeTotal: 5200,
      expenseTotal: 900,
      transferTotal: 50,
      accounts: mockSupport().accounts,
      groupedByAccount: {
        'Cuenta Principal': 800,
        'Billetera Digital': -150
      },
      recentTransactions: [
        { date: '10 Ene', type: 'Ingreso', category: 'Salario', account: 'Cuenta Principal', amount: 3200, sign: '+' },
        { date: '09 Ene', type: 'Gasto', category: 'Comida', account: 'Billetera Digital', amount: 60, sign: '-' }
      ],
      budgets: mockBudgets().slice(0, 2)
    };
  }

  function mockBudgets() {
    return [
      {
        monthLabel: 'Enero 2025',
        category: 'Comida',
        planned: 800,
        spent: 450,
        remaining: 350,
        progress: 56
      },
      {
        monthLabel: 'Enero 2025',
        category: 'Transporte',
        planned: 200,
        spent: 120,
        remaining: 80,
        progress: 60
      }
    ];
  }

  function mockReports() {
    return {
      monthly: [
        { label: 'Nov 2024', income: 3800, expense: 1200, transfer: 100 },
        { label: 'Dic 2024', income: 4100, expense: 1500, transfer: 0 }
      ],
      categories: [
        { category: 'Comida', amount: 450 },
        { category: 'Transporte', amount: 120 }
      ],
      accounts: [
        { account: 'Cuenta Principal', balance: 4200 },
        { account: 'Billetera Digital', balance: 180 }
      ]
    };
  }

  function mockSupport() {
    return {
      accounts: [
        { name: 'Cuenta Principal', balance: 3400 },
        { name: 'Billetera Digital', balance: 850 }
      ],
      categories: ['Salario', 'Comida', 'Transporte', 'Vivienda', 'Entretenimiento']
    };
  }
})();
