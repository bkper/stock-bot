namespace BotService {

  export function getStockBook(book: Bkper.Book): Bkper.Book {
    let connectedBooks = book.getCollection().getBooks();
    for (const connectedBook of connectedBooks) {
      let fractionDigits = connectedBook.getFractionDigits();
      if (fractionDigits == 0) {
        return connectedBook;
      }
    }
    return null;
  }

  export function getFinancialBook(book: Bkper.Book, excCode?: string): Bkper.Book {
    let connectedBooks = book.getCollection().getBooks();
    for (const connectedBook of connectedBooks) {
      let excCodeConnectedBook = getExcCode(connectedBook);
      let fractionDigits = connectedBook.getFractionDigits();
      if (fractionDigits != 0 && excCode == excCodeConnectedBook) {
        return connectedBook;
      }
    }
    return null;
  }

  export function getBotViewTemplate(baseBookId: string): GoogleAppsScript.HTML.HtmlOutput {
    let baseBook = BkperApp.getBook(baseBookId);

    let stockBook = getStockBook(baseBook);

    if (stockBook == null) {
      throw 'No book with 0 decimal places found in the collection';
    }

    const template = HtmlService.createTemplateFromFile('BotView');
  
    template.book = {
      id: stockBook.getId(),
      name: stockBook.getName(),
    }

    return template.evaluate().setTitle('Stock Bot');
  }

  export function getStockExchangeCode(account: Bkper.Account): string {
    if (account == null) {
      return null;
    }
    let groups = account.getGroups();
    if (groups != null) {
      for (const group of groups) {
        let stockExchange = group.getProperty(STOCK_EXC_CODE_PROP);
        if (stockExchange != null && stockExchange.trim() != '') {
          return stockExchange;
        }
      }
    }
    return null;
  }

  function getStockExchangeGroup(account: Bkper.Account): Bkper.Group {
    if (account == null) {
      return null;
    }
    let groups = account.getGroups();
    if (groups != null) {
      for (const group of groups) {
        let stockExchange = group.getProperty(STOCK_EXC_CODE_PROP);
        if (stockExchange != null && stockExchange.trim() != '') {
          return group;
        }
      }
    }
    return null;
  }

  export function revertRealizedResultsForAccount(stockBook: Bkper.Book, stockAccount: Bkper.Account) {
    let iterator = stockBook.getTransactions(`account:'${stockAccount.getName()}'`);
    
    let stockAccountSaleTransactions: Bkper.Transaction[] = [];
    let stockAccountPurchaseTransactions: Bkper.Transaction[] = [];

    let stockExcCode = getStockExchangeCode(stockAccount);
    let financialBook = getFinancialBook(stockBook, stockExcCode)

    while (iterator.hasNext()) {
      let tx = iterator.next();
      //Make sure get sales only

      if (tx.isChecked()) {
        tx.uncheck();
      }

      if (isSale(tx)) {
        let iterator = financialBook.getTransactions(`remoteId:${tx.getId()}`)
        while (iterator.hasNext()) {
          iterator.next().remove();
        }
        stockAccountSaleTransactions.push(tx);
      }

      if (isPurchase(tx)) {
        if (tx.getProperty(ORIGINAL_QUANTITY_PROP) == null) {
          tx.remove()
        } else {
          tx
          .deleteProperty(SALE_DATE_PROP)
          .deleteProperty(SALE_PRICE_PROP)
          .setAmount(+tx.getProperty(ORIGINAL_QUANTITY_PROP))
          .update();
          stockAccountPurchaseTransactions.push(tx);
        }
      }
    }

    stockAccount.deleteProperty(NEEDS_REBUILD_PROP).update();

    //FIFO
    stockAccountSaleTransactions = stockAccountSaleTransactions.sort(compareTo);
    stockAccountPurchaseTransactions = stockAccountPurchaseTransactions.sort(compareTo);

    for (const saleTransaction of stockAccountSaleTransactions) {
      processSale(financialBook, stockBook, stockAccount, saleTransaction, stockAccountPurchaseTransactions);
    }

  }

  export function flagAccountForRebuildIfNeeded(baseBook: Bkper.Book, event: bkper.Event): string {
    if (baseBook.getFractionDigits() == 0 && event.agent.id != 'stock-bot') {
      let operation = event.data.object as bkper.TransactionOperation;
      let transactionPayload = operation.transaction;
      let transaction = baseBook.getTransaction(transactionPayload.id);
      let stockAccount: Bkper.Account;
      if (BotService.isSale(transaction)) {
        stockAccount = transaction.getCreditAccount();
      }
      if (BotService.isPurchase(transaction)) {
        stockAccount = transaction.getDebitAccount();
      }

      if(stockAccount && stockAccount.getProperty(NEEDS_REBUILD_PROP) == null) {
        stockAccount.setProperty(NEEDS_REBUILD_PROP, 'TRUE').update();
        return `Flagging account ${stockAccount.getName()} for rebuild`;
      }
    }
    return null;
  }

  function needsRebuild(stockAccount: Bkper.Account): boolean {
    return stockAccount.getProperty(NEEDS_REBUILD_PROP) == 'TRUE';
  }

  export function calculateRealizedResultsForBook(stockBookId: string) {
    let stockBook = BkperApp.getBook(stockBookId);
    let stockAccounts = stockBook.getAccounts();
    for (let i = 0; i < stockAccounts.length; i++) {
        const stockAccount = stockAccounts[i];
        if (needsRebuild(stockAccount)) {
          revertRealizedResultsForAccount(stockBook, stockAccount);
          stockAccounts.splice(i, 1);
        }        
    }



    let saleTransactions: Bkper.Transaction[] = [];
    let purchaseTransactions: Bkper.Transaction[] = [];

    let iterator = stockBook.getTransactions(`is:unchecked`);

    while (iterator.hasNext()) {
      let tx = iterator.next();
      //Make sure get sales only
      if (isSale(tx)) {
        saleTransactions.push(tx);
      }
      if (isPurchase(tx)) {
        purchaseTransactions.push(tx);
      }
    }

    //FIFO
    saleTransactions = saleTransactions.sort(compareTo);
    purchaseTransactions = purchaseTransactions.sort(compareTo);
    //TODO sort based on 'order' property

    let booksToAudit: Bkper.Book[] = []
    booksToAudit.push(stockBook);

    for (const stockAccount of stockAccounts) {
      let stockExcCode = getStockExchangeCode(stockAccount);
      let financialBook = getFinancialBook(stockBook, stockExcCode);
      if (financialBook == null) {
        continue; //Skip
      }
      booksToAudit.push(financialBook);
      let stockAccountSaleTransactions = saleTransactions.filter(tx => tx.getCreditAccount().getId() == stockAccount.getId());
      let stockAccountPurchaseTransactions = purchaseTransactions.filter(tx => tx.getDebitAccount().getId() == stockAccount.getId());
      for (const saleTransaction of stockAccountSaleTransactions) {
        processSale(financialBook, stockBook, stockAccount, saleTransaction, stockAccountPurchaseTransactions);
      }
    }

    booksToAudit.forEach(book => book.audit());

  }

  export function isSale(transaction: Bkper.Transaction): boolean {
    return transaction.isPosted() && transaction.getDebitAccount().getType() == BkperApp.AccountType.OUTGOING;
  }

  export function isPurchase(transaction: Bkper.Transaction): boolean {
    return transaction.isPosted() && transaction.getCreditAccount().getType() == BkperApp.AccountType.INCOMING;
  }

  function compareTo(tx1: Bkper.Transaction, tx2: Bkper.Transaction): number {
    if (tx1.getDateValue() < tx2.getDateValue()) {
      return -1;
    }
    if (tx1.getProperty(ORDER_PROP) != null || tx2.getProperty(ORDER_PROP) != null) {
      let order1 = +tx1.getProperty(ORDER_PROP);
      let order2 = +tx2.getProperty(ORDER_PROP);
      if (order1 == null) {
        order1 = 0;
      }
      if (order2 == null) {
        order2 = 0;
      }
      if (order1 < order2) {
        return -1;
      }
    }
    if (tx1.getCreatedAt() && tx2.getCreatedAt()) {
      return tx1.getCreatedAt().getMilliseconds() - tx2.getCreatedAt().getMilliseconds();
    }
    return 0;
  }

  function processSale(financialBook: Bkper.Book, stockBook: Bkper.Book, stockAccount: Bkper.Account, saleTransaction: Bkper.Transaction, purchaseTransactions: Bkper.Transaction[]): void {

    let salePrice: number = +saleTransaction.getProperty(PRICE_PROP);

    let gainTotal = 0;
    let soldQuantity = saleTransaction.getAmount();

    for (const buyTransaction of purchaseTransactions) {

      let buyPrice: number = +buyTransaction.getProperty(PRICE_PROP);
      let buyQuantity = buyTransaction.getAmount();
      
      if (soldQuantity >= buyQuantity ) {
        let gain = (salePrice * buyQuantity) - (buyPrice * buyQuantity); 
        buyTransaction
        .setProperty(SALE_PRICE_PROP, salePrice.toFixed(financialBook.getFractionDigits()))
        .setProperty(SALE_DATE_PROP, saleTransaction.getDate())
        .addRemoteId(saleTransaction.getId())
        .update().check();
        gainTotal += gain;
        soldQuantity -= buyQuantity;
      } else {
        let remainingBuyQuantity = buyQuantity - soldQuantity;
        buyTransaction
        .setAmount(remainingBuyQuantity)
        .update();

        let partialBuyQuantity = buyQuantity - remainingBuyQuantity;

        let gain = (salePrice * partialBuyQuantity) - (buyPrice * partialBuyQuantity); 

        let newTransaction = stockBook.newTransaction()
        .setDate(buyTransaction.getDate())
        .setAmount(partialBuyQuantity)
        .setCreditAccount(buyTransaction.getCreditAccount())
        .setDebitAccount(buyTransaction.getDebitAccount())
        .setDescription(buyTransaction.getDescription())
        .setProperty(PRICE_PROP, buyTransaction.getProperty(PRICE_PROP))
        .setProperty(ORDER_PROP, buyTransaction.getProperty(ORDER_PROP))
        .setProperty(SALE_PRICE_PROP, salePrice.toFixed(financialBook.getFractionDigits()))
        .setProperty(SALE_DATE_PROP, saleTransaction.getDate())
        .post()
        .check()
        soldQuantity -= partialBuyQuantity;
        gainTotal += gain;

      }

      if (soldQuantity == 0) {
        break;
      }

    }

    const unrealizedAccountName = `${stockAccount.getName()} Unrealized`;
    let unrealizedAccount = financialBook.getAccount(unrealizedAccountName)
    if (unrealizedAccount == null) {
      let stockExchangeGroup = getStockExchangeGroup(stockAccount);
      let unrealizedGroup = stockExchangeGroup != null ? financialBook.getGroup(stockExchangeGroup.getName()) : null;
      unrealizedAccount = financialBook.newAccount()
      .setName(unrealizedAccountName)
      .setType(BkperApp.AccountType.LIABILITY)
      .addGroup(unrealizedGroup)
      .create()
    }


    if (gainTotal > 0) {

      const realizedGainAccountName = `${stockAccount.getName()} Gain`;
      let realizedGainAccount = financialBook.getAccount(realizedGainAccountName);
      if (realizedGainAccount == null) {
        realizedGainAccount = financialBook.newAccount()
        .setName(realizedGainAccountName)
        .setType(BkperApp.AccountType.INCOMING)
        .create()
      }

      financialBook.newTransaction()
      .addRemoteId(saleTransaction.getId())
      .setDate(saleTransaction.getDate())
      .setAmount(gainTotal)
      .setDescription(`sale of ${saleTransaction.getAmount()} #stock_gain`)
      .from(realizedGainAccount)
      .to(unrealizedAccount)
      .post();
      
    } else if (gainTotal < 0) {

      const realizedLossAccountName = `${stockAccount.getName()} Loss`;
      let realizedLossAccount = financialBook.getAccount(realizedLossAccountName);
      if (realizedLossAccount == null) {
        realizedLossAccount = financialBook.newAccount()
        .setName(realizedLossAccountName)
        .setType(BkperApp.AccountType.OUTGOING)
        .create()
      }

      financialBook.newTransaction()
      .addRemoteId(saleTransaction.getId())
      .setDate(saleTransaction.getDate())
      .setAmount(gainTotal)
      .setDescription(`sale of ${saleTransaction.getAmount()} #stock_loss`)
      .from(unrealizedAccount)
      .to(realizedLossAccount)
      .post()
    }

    saleTransaction.check();
  }

  export function getExcCode(book: Bkper.Book): string {
    return book.getProperty(EXC_CODE_PROP, 'exchange_code');
  }


}


// function testGetFinancialBook() {
//   let stockBook = BkperApp.getBook('agtzfmJrcGVyLWhyZHITCxIGTGVkZ2VyGICAwKeRvJQKDA');
//   let stockAccount = stockBook.getAccount('PETRO');

//   Logger.log(stockAccount.getName())

//   let excCode = BotService.getStockExchangeCode(stockAccount);
  
//   Logger.log(excCode)

//   let financialBook = BotService.getFinancialBook(stockBook, excCode);

//   Logger.log(financialBook.getName())

// }