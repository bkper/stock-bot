namespace RealizedResultsService {

  export function getBotViewTemplate(baseBookId: string, baseAccountId: string): GoogleAppsScript.HTML.HtmlOutput {

    let baseBook = BkperApp.getBook(baseBookId);
    let baseAccount = baseBook.getAccount(baseAccountId);

    let stockBook = BotService.getStockBook(baseBook);

    if (stockBook == null) {
      throw 'No book with 0 decimal places found in the collection';
    }

    const template = HtmlService.createTemplateFromFile('BotView');
  
    template.book = {
      id: stockBook.getId(),
      name: stockBook.getName(),
    }

    template.accounts = [];

    for (const account of stockBook.getAccounts()) {
      if (!account.isPermanent() || account.isArchived() || !BotService.getStockExchangeCode(account)) {
        //bypass non permanent accounts
        continue;
      }
      if (baseAccount == null || (baseAccount != null && baseAccount.getNormalizedName() == account.getNormalizedName())) {
        template.accounts.push({
          id: account.getId(),
          name: account.getName()
        })
      }
    }

    let stockAccount = baseAccount != null ? stockBook.getAccount(baseAccount.getName()) : null;

    template.account = {}

    if (stockAccount != null) {
      template.account = {
        id: stockAccount.getId(),
        name: stockAccount.getName()
      }
    }

    return template.evaluate().setTitle('Stock Bot');
  }
  export function resetRealizedResults(stockBookId: string, stockAccountId: string): Summary {
    let stockBook = BkperApp.getBook(stockBookId);
    let stockAccount = stockBook.getAccount(stockAccountId);

    revertRealizedResultsForAccount(stockBook, stockAccount, false);

    return {accountId: stockAccount.getId(), result: 'Done.'};
  }
  export function calculateRealizedResultsForAccount(stockBookId: string, stockAccountId: string): Summary {
    let stockBook = BkperApp.getBook(stockBookId);
    let stockAccount = stockBook.getAccount(stockAccountId);

    let summary: Summary = {
      accountId: stockAccountId,
      result: {}
    };


    if (needsRebuild(stockAccount)) {
      revertRealizedResultsForAccount(stockBook, stockAccount, true);
    } else {
      let stockExcCode = BotService.getStockExchangeCode(stockAccount);
      let financialBook = BotService.getFinancialBook(stockBook, stockExcCode);
      if (financialBook == null) {
        return; //Skip
      }

      let iterator = stockBook.getTransactions(`account:'${stockAccount.getName()}'`);

      let stockAccountSaleTransactions: Bkper.Transaction[] = [];
      let stockAccountPurchaseTransactions: Bkper.Transaction[] = [];

      while (iterator.hasNext()) {

        let tx = iterator.next();
  
        if (tx.isChecked()) {
          //Filter only unchecked
          continue;
        }
  
        if (BotService.isSale(tx)) {
            stockAccountSaleTransactions.push(tx);
        }
  
        if (BotService.isPurchase(tx)) {
            stockAccountPurchaseTransactions.push(tx);
        }
      }

      stockAccountSaleTransactions = stockAccountSaleTransactions.sort(compareTo);
      stockAccountPurchaseTransactions = stockAccountPurchaseTransactions.sort(compareTo);

      for (const saleTransaction of stockAccountSaleTransactions) {
        processSale(financialBook, stockExcCode, stockBook, stockAccount, saleTransaction, stockAccountPurchaseTransactions, summary);
      }

      checkLastTxDate(stockAccount, stockAccountSaleTransactions, stockAccountPurchaseTransactions);

    }

    return summary;

  }

  export function revertRealizedResultsForAccount(stockBook: Bkper.Book, stockAccount: Bkper.Account, recalculate: boolean): Summary {
    let iterator = stockBook.getTransactions(`account:'${stockAccount.getName()}'`);
    let summary: Summary = {
      accountId: stockAccount.getId(),
      result: {}
    };
    let stockAccountSaleTransactions: Bkper.Transaction[] = [];
    let stockAccountPurchaseTransactions: Bkper.Transaction[] = [];

    let stockExcCode = BotService.getStockExchangeCode(stockAccount);
    let financialBook = BotService.getFinancialBook(stockBook, stockExcCode)


    while (iterator.hasNext()) {
      let tx = iterator.next();
      //Make sure get sales only

      if (tx.isChecked()) {
        tx = tx.uncheck();
      }

      let i = financialBook.getTransactions(`remoteId:${tx.getId()}`)
      while (i.hasNext()) {
        let financialTx = i.next();
        if (financialTx.isChecked()) {
          financialTx = financialTx.uncheck();
        }
        financialTx.remove();
      }
      i = financialBook.getTransactions(`remoteId:mtm_${tx.getId()}`)
      while (i.hasNext()) {
        let mtmTx = i.next();
        if (mtmTx.isChecked()) {
          mtmTx = mtmTx.uncheck();
        }
        mtmTx.remove();
      }

      if (BotService.isSale(tx)) {
        if (tx.getProperty(ORIGINAL_QUANTITY_PROP) == null) {
          tx.remove();
        } else {
          tx.deleteProperty(GAIN_AMOUNT_PROP)
          .deleteProperty(GAIN_LOG_PROP)
          .deleteProperty(PURCHASE_AMOUNT_PROP)
          .deleteProperty(SALE_AMOUNT_PROP)
          .deleteProperty(SHORT_SALE_PROP)
          .deleteProperty(PURCHASE_PRICE_PROP)
          .setAmount(tx.getProperty(ORIGINAL_QUANTITY_PROP))
          .update();
          stockAccountSaleTransactions.push(tx);
        }

      }

      if (BotService.isPurchase(tx)) {
        if (tx.getProperty(ORIGINAL_QUANTITY_PROP) == null) {
          tx.remove()
        } else {
          tx
          .deleteProperty(SALE_DATE_PROP)
          .deleteProperty(SALE_PRICE_PROP)
          .deleteProperty(SALE_AMOUNT_PROP)
          .deleteProperty(SHORT_SALE_PROP)
          .deleteProperty(GAIN_AMOUNT_PROP)
          .deleteProperty(GAIN_LOG_PROP)
          .deleteProperty(PURCHASE_AMOUNT_PROP)
          .setAmount(tx.getProperty(ORIGINAL_QUANTITY_PROP))
          .update();
          stockAccountPurchaseTransactions.push(tx);
        }
      }
    }

    stockAccount.deleteProperty(NEEDS_REBUILD_PROP).update();

    if (recalculate) {
      //FIFO
      stockAccountSaleTransactions = stockAccountSaleTransactions.sort(compareTo);
      stockAccountPurchaseTransactions = stockAccountPurchaseTransactions.sort(compareTo);

      for (const saleTransaction of stockAccountSaleTransactions) {
        processSale(financialBook, stockExcCode, stockBook, stockAccount, saleTransaction, stockAccountPurchaseTransactions, summary);
      }
    }

    checkLastTxDate(stockAccount, stockAccountSaleTransactions, stockAccountPurchaseTransactions);

    return summary;

  }

  function needsRebuild(stockAccount: Bkper.Account): boolean {
    return stockAccount.getProperty(NEEDS_REBUILD_PROP) == 'TRUE';
  }

  function checkLastTxDate(stockAccount: Bkper.Account, stockAccountSaleTransactions: Bkper.Transaction[], stockAccountPurchaseTransactions: Bkper.Transaction[]) {
    let lastSaleTx = stockAccountSaleTransactions.length > 0 ? stockAccountSaleTransactions[stockAccountSaleTransactions.length - 1] : null;
    let lastPurchaseTx = stockAccountPurchaseTransactions.length > 0 ? stockAccountPurchaseTransactions[stockAccountPurchaseTransactions.length - 1] : null;

    let lastTxDate = lastSaleTx != null ? lastSaleTx.getDateValue() : null;
    if ((lastTxDate == null && lastPurchaseTx != null) || (lastPurchaseTx != null && lastPurchaseTx.getDateValue() > +lastTxDate)) {
      lastTxDate = lastPurchaseTx.getDateValue();
    }

    let stockAccountLastTxDate = stockAccount.getProperty(STOCK_REALIZED_DATE_PROP);

    if (lastTxDate != null && (stockAccountLastTxDate == null || lastTxDate > +stockAccountLastTxDate)) {
      stockAccount.deleteProperty('last_sale_date').setProperty(STOCK_REALIZED_DATE_PROP, lastTxDate + '').update();
    }
  }

  function compareTo(tx1: Bkper.Transaction, tx2: Bkper.Transaction): number {
    if (tx1.getDateValue() != tx2.getDateValue()) {
      return tx1.getDateValue() - tx2.getDateValue();
    }
    if (tx1.getProperty(ORDER_PROP) != null && tx2.getProperty(ORDER_PROP) != null) {
      let order1 = +tx1.getProperty(ORDER_PROP);
      let order2 = +tx2.getProperty(ORDER_PROP);
      console.log(`${order1} | ${order2}`)
      return order1 - order2;
    }
    if (tx1.getCreatedAt() && tx2.getCreatedAt()) {
      return tx1.getCreatedAt().getMilliseconds() - tx2.getCreatedAt().getMilliseconds();
    }
    return 0;
  }

  function log(stockBook: Bkper.Book, quantity: Bkper.Amount, price: Bkper.Amount, date: string): GainLogEntry {
    return {
      qt: quantity.toFixed(stockBook.getFractionDigits()).toString(),
      pr: price.toString(),
      dt: date,
    }
  }

  function isShortSale(purchaseTransaction: Bkper.Transaction, saleTransaction: Bkper.Transaction): boolean {
    return compareTo(saleTransaction, purchaseTransaction) < 0;
  }

  function processSale(financialBook: Bkper.Book, stockExcCode: string, stockBook: Bkper.Book, stockAccount: Bkper.Account, saleTransaction: Bkper.Transaction, purchaseTransactions: Bkper.Transaction[], summary: Summary): void {

    let salePrice: Bkper.Amount = BkperApp.newAmount(saleTransaction.getProperty(SALE_PRICE_PROP, PRICE_PROP));

    let soldQuantity = saleTransaction.getAmount();
    
    let purchaseTotal = BkperApp.newAmount(0);
    let saleTotal = BkperApp.newAmount(0);
    let gainTotal = BkperApp.newAmount(0);

    let unrealizedAccountName = `${stockAccount.getName()} ${UREALIZED_SUFFIX}`;
    let unrealizedAccount = financialBook.getAccount(unrealizedAccountName)
    if (unrealizedAccount == null) {
      unrealizedAccount = financialBook.newAccount()
      .setName(unrealizedAccountName)
      .setType(BkperApp.AccountType.LIABILITY);
      let groups = getAccountGroups(financialBook, UREALIZED_SUFFIX);
      groups.forEach(group => unrealizedAccount.addGroup(group));
      unrealizedAccount.create();
      trackAccountCreated(summary, stockExcCode, unrealizedAccount);
    }

    let gainLogEntries: GainLogEntry[] = []
    
    for (const purchaseTransaction of purchaseTransactions) {

      let shortSale = isShortSale(purchaseTransaction, saleTransaction);

      if (purchaseTransaction.isChecked()) {
        //Only process unchecked ones
        continue;
      }

      let purchasePrice: Bkper.Amount = BkperApp.newAmount(purchaseTransaction.getProperty(PURCHASE_PRICE_PROP, PRICE_PROP));
      let purchaseQuantity = purchaseTransaction.getAmount();


      
      if (soldQuantity.gte(purchaseQuantity)) {
        const saleAmount = (salePrice.times(purchaseQuantity));
        const purchaseAmount = (purchasePrice.times(purchaseQuantity));
        let gain = saleAmount.minus(purchaseAmount); 
        if (!shortSale) {
          purchaseTotal = purchaseTotal.plus(purchaseAmount);
          saleTotal = saleTotal.plus(saleAmount);
          gainTotal = gainTotal.plus(gain);
          gainLogEntries.push(log(stockBook, purchaseQuantity, purchasePrice, purchaseTransaction.getDate()))
        }
        if (shortSale) {
          purchaseTransaction
          .setProperty(PURCHASE_PRICE_PROP, purchasePrice.toString())
          .setProperty(PURCHASE_AMOUNT_PROP, purchaseAmount.toString())
          .setProperty(SALE_PRICE_PROP, salePrice.toString())
          .setProperty(SALE_AMOUNT_PROP, saleAmount.toString())
          .setProperty(SALE_DATE_PROP, saleTransaction.getDate())
          .setProperty(GAIN_AMOUNT_PROP, gain.toString())
          .setProperty(SHORT_SALE_PROP, 'true')
          .update();
          
          recordRealizedResult(stockBook, stockAccount, stockExcCode, financialBook, unrealizedAccount, purchaseTransaction, gain, purchaseTransaction.getDate(), purchaseTransaction.getDateObject(), purchasePrice, summary);

        }
        
        purchaseTransaction.check();

        soldQuantity = soldQuantity.minus(purchaseQuantity);

      } else {
        
        let remainingBuyQuantity = purchaseQuantity.minus(soldQuantity);

        let partialBuyQuantity = purchaseQuantity.minus(remainingBuyQuantity);

        const saleAmount = salePrice.times(partialBuyQuantity);
        const purchaseAmount = purchasePrice.times(partialBuyQuantity);
        let gain = saleAmount.minus(purchaseAmount); 

        purchaseTransaction
        .setAmount(remainingBuyQuantity)
        .update();

        let splittedPurchaseTransaction = stockBook.newTransaction()
        .setDate(purchaseTransaction.getDate())
        .setAmount(partialBuyQuantity)
        .setCreditAccount(purchaseTransaction.getCreditAccount())
        .setDebitAccount(purchaseTransaction.getDebitAccount())
        .setDescription(purchaseTransaction.getDescription())
        .setProperty(ORDER_PROP, purchaseTransaction.getProperty(ORDER_PROP))
        .setProperty(PARENT_ID, purchaseTransaction.getId())

        if (shortSale) {
          splittedPurchaseTransaction.setProperty(PURCHASE_PRICE_PROP, purchasePrice.toString())
          .setProperty(PURCHASE_AMOUNT_PROP, purchaseAmount.toString())
          .setProperty(SALE_PRICE_PROP, salePrice.toString())
          .setProperty(SALE_AMOUNT_PROP, saleAmount.toString())
          .setProperty(SALE_DATE_PROP, saleTransaction.getDate())
          .setProperty(GAIN_AMOUNT_PROP, gain.toString())
          .setProperty(SHORT_SALE_PROP, 'true')
        }
        
        splittedPurchaseTransaction.post().check()

        if (shortSale) {
          recordRealizedResult(stockBook, stockAccount, stockExcCode, financialBook, unrealizedAccount, splittedPurchaseTransaction, gain, splittedPurchaseTransaction.getDate(), splittedPurchaseTransaction.getDateObject(), purchasePrice, summary);
        }

        soldQuantity = soldQuantity.minus(partialBuyQuantity);
        
        if (!shortSale) {
          purchaseTotal = purchaseTotal.plus(purchaseAmount);
          saleTotal = saleTotal.plus(saleAmount);
          gainTotal = gainTotal.plus(gain);
          gainLogEntries.push(log(stockBook, purchaseQuantity, purchasePrice, purchaseTransaction.getDate()))
        }

      }

      if (soldQuantity.lte(0)) {
        break;
      }

    }


    if (soldQuantity.round(stockBook.getFractionDigits()).eq(0)) {
      if (gainLogEntries.length > 0) {
        saleTransaction
        .setProperty(PURCHASE_AMOUNT_PROP, purchaseTotal.toString()) 
        .setProperty(SALE_AMOUNT_PROP, saleTotal.toString())
        .setProperty(GAIN_AMOUNT_PROP, gainTotal.toString())
        .setProperty(GAIN_LOG_PROP, JSON.stringify(gainLogEntries))
        saleTransaction.update()
      }
    saleTransaction.check();
    } else if (soldQuantity.round(stockBook.getFractionDigits()).gt(0)) {

      let remainingSaleQuantity = saleTransaction.getAmount().minus(soldQuantity);

      if (!remainingSaleQuantity.eq(0)) {

        saleTransaction

        .setAmount(soldQuantity)
        .update();

        let splittedSaleTransaction = stockBook.newTransaction()
        .setDate(saleTransaction.getDate())
        .setAmount(remainingSaleQuantity)
        .setCreditAccount(saleTransaction.getCreditAccount())
        .setDebitAccount(saleTransaction.getDebitAccount())
        .setDescription(saleTransaction.getDescription())
        .setProperty(ORDER_PROP, saleTransaction.getProperty(ORDER_PROP))
        .setProperty(PARENT_ID, saleTransaction.getId())
        .setProperty(SALE_PRICE_PROP, salePrice.toString());

        if (gainLogEntries.length > 0) {
          splittedSaleTransaction
          .setProperty(PURCHASE_AMOUNT_PROP, purchaseTotal.toString()) 
          .setProperty(SALE_AMOUNT_PROP, saleTotal.toString())
          .setProperty(GAIN_AMOUNT_PROP, gainTotal.toString())
          .setProperty(GAIN_LOG_PROP, JSON.stringify(gainLogEntries))
        }

        splittedSaleTransaction.post().check()
      }

    }

    recordRealizedResult(stockBook, stockAccount, stockExcCode, financialBook, unrealizedAccount, saleTransaction, gainTotal, saleTransaction.getDate(), saleTransaction.getDateObject(), salePrice, summary, );

  }

  function recordRealizedResult(
    stockBook: Bkper.Book, 
    stockAccount: Bkper.Account, 
    stockExcCode: string, 
    financialBook: Bkper.Book, 
    unrealizedAccount: Bkper.Account, 
    transaction: Bkper.Transaction, 
    gain: Bkper.Amount, 
    gainDate: string, 
    gainDateObject: Date, 
    price: Bkper.Amount,
    summary: Summary 
    ) {

    if (gain.round(financialBook.getFractionDigits()).gt(0)) {

      let realizedGainAccountName = `${stockAccount.getName()} ${REALIZED_SUFFIX}`;
      let realizedGainAccount = financialBook.getAccount(realizedGainAccountName);

      if (realizedGainAccount == null) {
        //Fallback to old XXX Gain default
        realizedGainAccount = financialBook.getAccount(`${stockAccount.getName()} Realized Gain`);
      }


      if (realizedGainAccount == null) {
        realizedGainAccount = financialBook.newAccount()
          .setName(realizedGainAccountName)
          .setType(BkperApp.AccountType.INCOMING);
        let groups = getAccountGroups(financialBook, REALIZED_SUFFIX);
        groups.forEach(group => realizedGainAccount.addGroup(group));
        realizedGainAccount.create();
        trackAccountCreated(summary, stockExcCode, realizedGainAccount);
      }

      financialBook.newTransaction()
        .addRemoteId(transaction.getId())
        .setDate(gainDate)
        .setAmount(gain)
        .setDescription(`#stock_gain`)
        .from(realizedGainAccount)
        .to(unrealizedAccount)
        .post();

      markToMarket(stockBook, transaction, stockAccount, financialBook, unrealizedAccount, gainDateObject, price);

    } else if (gain.round(financialBook.getFractionDigits()).lt(0)) {

      let realizedLossAccountName = `${stockAccount.getName()} ${REALIZED_SUFFIX}`;
      let realizedLossAccount = financialBook.getAccount(realizedLossAccountName);

      if (realizedLossAccount == null) {
        //Fallback to old XXX Loss account
        realizedLossAccount = financialBook.getAccount(`${stockAccount.getName()} Realized Loss`);
      }
      if (realizedLossAccount == null) {
        realizedLossAccount = financialBook.newAccount()
          .setName(realizedLossAccountName)
          .setType(BkperApp.AccountType.OUTGOING);
        let groups = getAccountGroups(financialBook, REALIZED_SUFFIX);
        groups.forEach(group => realizedLossAccount.addGroup(group));
        realizedLossAccount.create();
        trackAccountCreated(summary, stockExcCode, realizedLossAccount);
      }

      financialBook.newTransaction()
        .addRemoteId(transaction.getId())
        .setDate(gainDate)
        .setAmount(gain)
        .setDescription(`#stock_loss`)
        .from(unrealizedAccount)
        .to(realizedLossAccount)
        .post().check();

      markToMarket(stockBook, transaction, stockAccount, financialBook, unrealizedAccount, gainDateObject, price);
    }
  }

  function trackAccountCreated(summary: Summary, stockExcCode: string, account: Bkper.Account) {
    if (summary.result[stockExcCode] == null) {
      summary.result[stockExcCode] = [];
    }
    summary.result[stockExcCode].push(account.getName());
  }

  function markToMarket(stockBook: Bkper.Book, transaction: Bkper.Transaction, stockAccount: Bkper.Account, financialBook: Bkper.Book, unrealizedAccount: Bkper.Account, date: Date, price: Bkper.Amount): void {
    let total_quantity = getAccountBalance(stockBook, stockAccount, date);
    let financialInstrument = financialBook.getAccount(stockAccount.getName());
    let balance = getAccountBalance(financialBook, financialInstrument, date);
    let newBalance = total_quantity.times(price);

    let amount = newBalance.minus(balance);

    if (amount.round(financialBook.getFractionDigits()).gt(0)) {

      financialBook.newTransaction()
      .setDate(date)
      .setAmount(amount)
      .setDescription(`#mtm`)
      .setProperty(PRICE_PROP, financialBook.formatValue(price))
      .setProperty(OPEN_QUANTITY_PROP, total_quantity.toFixed(stockBook.getFractionDigits()))
      .from(unrealizedAccount)
      .to(financialInstrument)
      .addRemoteId(`mtm_${transaction.getId()}`)
      .post().check();

    } else if (amount.round(financialBook.getFractionDigits()).lt(0)) {
      financialBook.newTransaction()
      .setDate(date)
      .setAmount(amount)
      .setDescription(`#mtm`)
      .setProperty(PRICE_PROP, financialBook.formatValue(price))
      .setProperty(OPEN_QUANTITY_PROP, total_quantity.toFixed(stockBook.getFractionDigits()))      
      .from(financialInstrument)
      .to(unrealizedAccount)
      .addRemoteId(`mtm_${transaction.getId()}`)
      .post().check();
    }
  }

  function getAccountBalance(book: Bkper.Book, account: Bkper.Account, date: Date): Bkper.Amount {
    let balances = book.getBalancesReport(`account:"${account.getName()}" on:${book.formatDate(date)}`);
    let containers = balances.getBalancesContainers();
    if (containers == null || containers.length == 0) {
      return BkperApp.newAmount(0);
    }
    return containers[0].getCumulativeBalance();
  }

  function getAccountGroups(book: Bkper.Book, gainLossSuffix: string): Set<Bkper.Group> {
    let accountNames = new Set<string>();

    book.getAccounts().forEach(account => {
      if (account.getName().endsWith(` ${gainLossSuffix}`)) {
        accountNames.add(account.getName());
      }
    });

    let groups = new Set<Bkper.Group>();

    accountNames.forEach(accountName => {
      let account = book.getAccount(accountName);
      if (account && account.getGroups()) {
        account.getGroups().forEach(group => {groups.add(group)})
      }
    })

    return groups;
  }

}
