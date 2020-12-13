namespace RealizedResultsService {

  export function getBotViewTemplate(baseBookId: string, baseAccountId: string): GoogleAppsScript.HTML.HtmlOutput {

    let baseBook = BkperApp.getBook(baseBookId);
    let baseAccount = baseBook.getAccount(baseAccountId);

    let stockBook = BotService.getStockBook(baseBook);

    if (stockBook == null) {
      throw 'No book with 0 decimal places found in the collection';
    }

    let stockAccount = baseAccount != null ? stockBook.getAccount(baseAccount.getName()) : null;

    const template = HtmlService.createTemplateFromFile('BotView');
  
    template.book = {
      id: stockBook.getId(),
      name: stockBook.getName(),
    }

    template.account = {}

    if (stockAccount != null) {
      template.account = {
        id: stockAccount.getId(),
        name: stockAccount.getName()
      }
    }

    return template.evaluate().setTitle('Stock Bot');
  }
  export function resetRealizedResults(stockBookId: string, stockAccountId: string) {
    let stockBook = BkperApp.getBook(stockBookId);
    let stockAccount = stockBook.getAccount(stockAccountId);

    let booksToAudit: Set<Bkper.Book> = new Set<Bkper.Book>();

    revertRealizedResultsForAccount(stockBook, stockAccount, false, booksToAudit);

    auditBooks(booksToAudit);

  }
  export function calculateRealizedResultsForAccount(stockBookId: string, stockAccountId: string) {
    let stockBook = BkperApp.getBook(stockBookId);
    let stockAccount = stockBook.getAccount(stockAccountId);

    let booksToAudit: Set<Bkper.Book> = new Set<Bkper.Book>();

    booksToAudit.add(stockBook);

    if (needsRebuild(stockAccount)) {
      revertRealizedResultsForAccount(stockBook, stockAccount, true, booksToAudit);
    } else {
      let stockExcCode = BotService.getStockExchangeCode(stockAccount);
      let financialBook = BotService.getFinancialBook(stockBook, stockExcCode);
      if (financialBook == null) {
        return; //Skip
      }

      booksToAudit.add(financialBook);

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

      for (const saleTransaction of stockAccountSaleTransactions) {
        processSale(financialBook, stockBook, stockAccount, saleTransaction, stockAccountPurchaseTransactions);
      }

      checkLastTxDate(stockAccount, stockAccountSaleTransactions, stockAccountPurchaseTransactions);

    }

    auditBooks(booksToAudit);

  }


  export function calculateRealizedResultsForBook(stockBookId: string) {
    let stockBook = BkperApp.getBook(stockBookId);
    let stockAccounts = stockBook.getAccounts();
    let booksToAudit: Set<Bkper.Book> = new Set<Bkper.Book>();
    for (let i = 0; i < stockAccounts.length; i++) {
        const stockAccount = stockAccounts[i];
        if (needsRebuild(stockAccount)) {
          revertRealizedResultsForAccount(stockBook, stockAccount, true, booksToAudit);
          stockAccounts.splice(i, 1);
        }        
    }

    let saleTransactions: Bkper.Transaction[] = [];
    let purchaseTransactions: Bkper.Transaction[] = [];

    let iterator = stockBook.getTransactions(`is:unchecked`);

    while (iterator.hasNext()) {
      let tx = iterator.next();
      //Make sure get sales only
      if (BotService.isSale(tx)) {
        saleTransactions.push(tx);
      }
      if (BotService.isPurchase(tx)) {
        purchaseTransactions.push(tx);
      }
    }

    //FIFO
    saleTransactions = saleTransactions.sort(compareTo);
    purchaseTransactions = purchaseTransactions.sort(compareTo);
    //TODO sort based on 'order' property

    booksToAudit.add(stockBook);

    for (const stockAccount of stockAccounts) {
      let stockExcCode = BotService.getStockExchangeCode(stockAccount);
      let financialBook = BotService.getFinancialBook(stockBook, stockExcCode);
      if (financialBook == null) {
        continue; //Skip
      }
      booksToAudit.add(financialBook);
      let stockAccountSaleTransactions = saleTransactions.filter(tx => tx.getCreditAccount().getId() == stockAccount.getId());
      let stockAccountPurchaseTransactions = purchaseTransactions.filter(tx => tx.getDebitAccount().getId() == stockAccount.getId());
      for (const saleTransaction of stockAccountSaleTransactions) {
        processSale(financialBook, stockBook, stockAccount, saleTransaction, stockAccountPurchaseTransactions);
      }

      checkLastTxDate(stockAccount, stockAccountSaleTransactions, stockAccountPurchaseTransactions);

    }

    auditBooks(booksToAudit);

  }



  function auditBooks(booksToAudit: Set<Bkper.Book>) {
    booksToAudit.forEach(book => {
      console.log(`Auditing book ${book.getName()}`)
      book.audit()
    });
  }

  export function revertRealizedResultsForAccount(stockBook: Bkper.Book, stockAccount: Bkper.Account, recalculate: boolean, booksToAudit: Set<Bkper.Book>) {
    let iterator = stockBook.getTransactions(`account:'${stockAccount.getName()}'`);
    
    let stockAccountSaleTransactions: Bkper.Transaction[] = [];
    let stockAccountPurchaseTransactions: Bkper.Transaction[] = [];

    let stockExcCode = BotService.getStockExchangeCode(stockAccount);
    let financialBook = BotService.getFinancialBook(stockBook, stockExcCode)

    booksToAudit.add(stockBook);
    booksToAudit.add(financialBook);

    while (iterator.hasNext()) {
      let tx = iterator.next();
      //Make sure get sales only

      if (tx.isChecked()) {
        tx = tx.uncheck();
      }

      if (BotService.isSale(tx)) {
        let iterator = financialBook.getTransactions(`remoteId:${tx.getId()}`)
        while (iterator.hasNext()) {
          let financialTx = iterator.next();
          if (financialTx.isChecked()) {
            financialTx = financialTx.uncheck();
          }
          financialTx.remove();
        }
        if (tx.getProperty(ORIGINAL_QUANTITY_PROP, PRICE_PROP) == null) {
          tx.remove();
        } else {
          tx.deleteProperty(GAIN_AMOUNT_PROP)
          tx.deleteProperty(PURCHASE_AMOUNT_PROP)
          tx.deleteProperty(SALE_AMOUNT_PROP)
          tx.deleteProperty(PURCHASE_PRICE_PROP);

          let originalQuantity = tx.getProperty(ORIGINAL_QUANTITY_PROP)
          if (originalQuantity == null) {
            //Migrating missing original property on salee
            tx.setProperty(ORIGINAL_QUANTITY_PROP, tx.getAmount().toFixed(financialBook.getFractionDigits()))
          } else {
            tx.setAmount(+originalQuantity);
          }

          //Migrating deprecated price property
          let deprecatedPrice = tx.getProperty(PRICE_PROP);
          if (deprecatedPrice) {
            tx.setProperty(SALE_PRICE_PROP, deprecatedPrice);
            tx.deleteProperty(PRICE_PROP)
          }


          tx.update();
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
          .deleteProperty(GAIN_AMOUNT_PROP)
          .deleteProperty(PURCHASE_AMOUNT_PROP)
          .setAmount(+tx.getProperty(ORIGINAL_QUANTITY_PROP));

          //Migrating deprecated price property
          let deprecatedPrice = tx.getProperty(PRICE_PROP);
          if (deprecatedPrice) {
            tx.setProperty(PURCHASE_PRICE_PROP, deprecatedPrice);
            tx.deleteProperty(PRICE_PROP)
          }

          tx.update();
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
        processSale(financialBook, stockBook, stockAccount, saleTransaction, stockAccountPurchaseTransactions);
      }
    }

    checkLastTxDate(stockAccount, stockAccountSaleTransactions, stockAccountPurchaseTransactions);

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

  function processSale(financialBook: Bkper.Book, stockBook: Bkper.Book, stockAccount: Bkper.Account, saleTransaction: Bkper.Transaction, purchaseTransactions: Bkper.Transaction[]): void {

    let salePrice: number = +saleTransaction.getProperty(SALE_PRICE_PROP, PRICE_PROP);

    let gainTotal = 0;
    let soldQuantity = saleTransaction.getAmount();

    let purchaseTotal = 0;
    let saleTotal = 0;

    let gainDateValue = saleTransaction.getDateValue();
    let gainDateObject = saleTransaction.getDateObject();
    let gainDate = saleTransaction.getDate();

    for (const purchaseTransaction of purchaseTransactions) {

      if (purchaseTransaction.isChecked()) {
        //Only process unchecked ones
        continue;
      }

      let purchasePrice: number = +purchaseTransaction.getProperty(PURCHASE_PRICE_PROP, PRICE_PROP);
      let purchaseQuantity = purchaseTransaction.getAmount();
      
      if (soldQuantity >= purchaseQuantity ) {
        const saleAmount = (salePrice * purchaseQuantity);
        const purchaseAmount = (purchasePrice * purchaseQuantity);
        let gain = saleAmount - purchaseAmount; 
        purchaseTransaction
        .setProperty(SALE_PRICE_PROP, salePrice+'')
        .setProperty(SALE_DATE_PROP, saleTransaction.getDate())
        .setProperty(SALE_AMOUNT_PROP, saleAmount.toFixed(financialBook.getFractionDigits()))
        .setProperty(PURCHASE_AMOUNT_PROP, purchaseAmount.toFixed(financialBook.getFractionDigits()))
        .addRemoteId(saleTransaction.getId())
        .update().check();

        gainTotal += gain;
        purchaseTotal += purchaseAmount;
        saleTotal += saleAmount;
        soldQuantity -= purchaseQuantity;
      } else {
        
        let remainingBuyQuantity = purchaseQuantity - soldQuantity;
        purchaseTransaction
        .setAmount(remainingBuyQuantity)
        .update();

        let partialBuyQuantity = purchaseQuantity - remainingBuyQuantity;

        const saleAmount = (salePrice * partialBuyQuantity);
        const purchaseAmount = (purchasePrice * partialBuyQuantity);
        let gain = saleAmount - purchaseAmount; 

        stockBook.newTransaction()
        .setDate(purchaseTransaction.getDate())
        .setAmount(partialBuyQuantity)
        .setCreditAccount(purchaseTransaction.getCreditAccount())
        .setDebitAccount(purchaseTransaction.getDebitAccount())
        .setDescription(purchaseTransaction.getDescription())
        .setProperty(PURCHASE_PRICE_PROP, purchaseTransaction.getProperty(PURCHASE_PRICE_PROP, PRICE_PROP))
        .setProperty(PURCHASE_AMOUNT_PROP, purchaseAmount.toFixed(financialBook.getFractionDigits()))
        .setProperty(ORDER_PROP, purchaseTransaction.getProperty(ORDER_PROP))
        .setProperty(SALE_AMOUNT_PROP, saleAmount.toFixed(financialBook.getFractionDigits()))
        .setProperty(SALE_PRICE_PROP, salePrice+'')
        .setProperty(SALE_DATE_PROP, saleTransaction.getDate())
        .post()
        .check()

        soldQuantity -= partialBuyQuantity;
        gainTotal += gain;
        purchaseTotal += purchaseAmount;
        saleTotal += saleAmount;
      }

      // Get last date that closes the position
      if (purchaseTransaction.getDateValue() > gainDateValue) {
        gainDateValue = purchaseTransaction.getDateValue();
        gainDateObject = purchaseTransaction.getDateObject();
        gainDate = purchaseTransaction.getDate();
      }      

      if (soldQuantity <= 0) {
        break;
      }

    }

    let unrealizedAccountName = stockAccount.getProperty(STOCK_UNREALIZED_ACCOUNT_PROP);
    if (unrealizedAccountName == null) {
      unrealizedAccountName = `${stockAccount.getName()} ${UREALIZED_SUFFIX}`;
    }
    let unrealizedAccount = financialBook.getAccount(unrealizedAccountName)
    if (unrealizedAccount == null) {
      unrealizedAccount = financialBook.newAccount()
      .setName(unrealizedAccountName)
      .setType(BkperApp.AccountType.LIABILITY);
      let groups = getAccountGroups(financialBook, STOCK_UNREALIZED_ACCOUNT_PROP, UREALIZED_SUFFIX);
      groups.forEach(group => unrealizedAccount.addGroup(group));
      unrealizedAccount.create();      
    }


    if (gainTotal > 0) {

      let realizedGainAccountName = stockAccount.getProperty(STOCK_GAIN_ACCOUNT_PROP);
      if (realizedGainAccountName == null) {
        realizedGainAccountName = `${stockAccount.getName()} ${REALIZED_GAIN_SUFFIX}`
      }
      let realizedGainAccount = financialBook.getAccount(realizedGainAccountName);

      if (realizedGainAccount == null) {
        //Fallback to old XXX Gain default
        realizedGainAccount = financialBook.getAccount(`${stockAccount.getName()} Gain`);
      }


      if (realizedGainAccount == null) {
        realizedGainAccount = financialBook.newAccount()
        .setName(realizedGainAccountName)
        .setType(BkperApp.AccountType.INCOMING);
        let groups = getAccountGroups(financialBook, STOCK_GAIN_ACCOUNT_PROP, REALIZED_GAIN_SUFFIX);
        groups.forEach(group => realizedGainAccount.addGroup(group));
        realizedGainAccount.create();
      }

      financialBook.newTransaction()
      .addRemoteId(saleTransaction.getId())
      .setDate(gainDate)
      .setAmount(gainTotal)
      .setDescription(`sale of ${saleTransaction.getAmount()} #stock_gain`)
      .from(realizedGainAccount)
      .to(unrealizedAccount)
      .post();

      markToMarket(stockBook, stockAccount, financialBook, unrealizedAccount, gainDateObject, salePrice)

    } else if (gainTotal < 0) {

      let realizedLossAccountName = stockAccount.getProperty(STOCK_LOSS_ACCOUNT_PROP);
      if (realizedLossAccountName == null) {
        realizedLossAccountName = `${stockAccount.getName()} ${REALIZED_LOSS_SUFFIX}`
      }
      let realizedLossAccount = financialBook.getAccount(realizedLossAccountName);

      if (realizedLossAccount == null) {
        //Fallback to old XXX Loss account
        realizedLossAccount = financialBook.getAccount(`${stockAccount.getName()} Loss`);
      }

      if (realizedLossAccount == null) {
        realizedLossAccount = financialBook.newAccount()
        .setName(realizedLossAccountName)
        .setType(BkperApp.AccountType.OUTGOING);
        let groups = getAccountGroups(financialBook, STOCK_LOSS_ACCOUNT_PROP, REALIZED_LOSS_SUFFIX);
        groups.forEach(group => realizedLossAccount.addGroup(group));
        realizedLossAccount.create()
      }

      financialBook.newTransaction()
      .addRemoteId(saleTransaction.getId())
      .setDate(gainDate)
      .setAmount(gainTotal)
      .setDescription(`sale of ${saleTransaction.getAmount()} #stock_loss`)
      .from(unrealizedAccount)
      .to(realizedLossAccount)
      .post().check();

      markToMarket(stockBook, stockAccount, financialBook, unrealizedAccount, gainDateObject, salePrice)
    }

    if (soldQuantity == 0) {
      saleTransaction
      .setProperty(GAIN_AMOUNT_PROP, gainTotal.toFixed(financialBook.getFractionDigits()))
      .setProperty(PURCHASE_AMOUNT_PROP, purchaseTotal.toFixed(financialBook.getFractionDigits()))
      .setProperty(SALE_AMOUNT_PROP, saleTotal.toFixed(financialBook.getFractionDigits()))
      .update().check();
    } else if (soldQuantity > 0) {

      let remainingSaleQuantity = saleTransaction.getAmount() - soldQuantity;

      if (remainingSaleQuantity != 0) {

        saleTransaction
        .setAmount(soldQuantity)
        .update();

        stockBook.newTransaction()
        .setDate(saleTransaction.getDate())
        .setAmount(remainingSaleQuantity)
        .setCreditAccount(saleTransaction.getCreditAccount())
        .setDebitAccount(saleTransaction.getDebitAccount())
        .setDescription(saleTransaction.getDescription())
        .setProperty(ORDER_PROP, saleTransaction.getProperty(ORDER_PROP))
        .setProperty(SALE_PRICE_PROP, salePrice+'')
        .setProperty(GAIN_AMOUNT_PROP, gainTotal.toFixed(financialBook.getFractionDigits()))
        .setProperty(PURCHASE_AMOUNT_PROP, purchaseTotal.toFixed(financialBook.getFractionDigits())) 
        .setProperty(SALE_AMOUNT_PROP, saleTotal.toFixed(financialBook.getFractionDigits()))
        .post()
        .check()
      }

    }
  }

  function markToMarket(stockBook: Bkper.Book, stockAccount: Bkper.Account, financialBook: Bkper.Book, unrealizedAccount: Bkper.Account, date: Date, price: number): void {
    let total_quantity = getAccountBalance(stockBook, stockAccount, date);
    let financialInstrument = financialBook.getAccount(stockAccount.getName());
    let balance = getAccountBalance(financialBook, financialInstrument, date);
    let newBalance = total_quantity * price;

    let amount = +(newBalance - balance).toFixed(financialBook.getFractionDigits());

    if (amount > 0) {

      financialBook.newTransaction()
      .setDate(date)
      .setAmount(amount)
      .setDescription(`#mtm`)
      .setProperty(PRICE_PROP, financialBook.formatValue(price))
      .setProperty(OPEN_QUANTITY_PROP, total_quantity.toFixed(0))
      .from(unrealizedAccount)
      .to(financialInstrument)
      .post().check();

    } else if (amount < 0) {
      financialBook.newTransaction()
      .setDate(date)
      .setAmount(amount)
      .setDescription(`#mtm`)
      .setProperty(PRICE_PROP, financialBook.formatValue(price))
      .setProperty(OPEN_QUANTITY_PROP, total_quantity.toFixed(0))      
      .from(financialInstrument)
      .to(unrealizedAccount)
      .post().check();
    }
  }

  function getAccountBalance(book: Bkper.Book, account: Bkper.Account, date: Date): number {
    let balances = book.getBalancesReport(`account:"${account.getName()}" on:${book.formatDate(date)}`);
    let containers = balances.getBalancesContainers();
    if (containers == null || containers.length == 0) {
      return 0;
    }
    return containers[0].getCumulativeBalance();
  }

  function getAccountGroups(book: Bkper.Book, accountProperty: string, gainLossSuffix: string): Set<Bkper.Group> {
    let accountNames = new Set<string>();

    book.getAccounts().forEach(account => {
      let accountName = account.getProperty(accountProperty);
      if (accountName) {
        accountNames.add(accountName);
      }
      if (account.getName().endsWith(gainLossSuffix)) {
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
