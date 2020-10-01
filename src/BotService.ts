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


  export function calculateRealizedResultsForBook(stockBookId: string) {
    let stockBook = BkperApp.getBook(stockBookId);

    //let excCode = getStockExchangeCodeForAccount(stockAccount);

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
    saleTransactions = saleTransactions.reverse();
    purchaseTransactions = purchaseTransactions.reverse();
    //TODO sort based on 'order' property

    let stockAccounts = stockBook.getAccounts();
    for (const stockAccount of stockAccounts) {
      let stockExcCode = getStockExchangeCode(stockAccount);
      let financialBook = getFinancialBook(stockBook, stockExcCode)
      let stockAccountSaleTransactions = saleTransactions.filter(tx => tx.getCreditAccount().getId() == stockAccount.getId());
      let stockAccountPurchaseTransactions = purchaseTransactions.filter(tx => tx.getDebitAccount().getId() == stockAccount.getId());
      for (const saleTransaction of stockAccountSaleTransactions) {
        processSale(financialBook, stockBook, saleTransaction, stockAccountPurchaseTransactions);
      }
    }

  }

  function isSale(transaction: Bkper.Transaction): boolean {
    return transaction.isPosted() && transaction.getDebitAccount().getType() == BkperApp.AccountType.OUTGOING;
  }

  function isPurchase(transaction: Bkper.Transaction): boolean {
    return transaction.isPosted() && transaction.getCreditAccount().getType() == BkperApp.AccountType.INCOMING;
  }


  function processSale(financialBook: Bkper.Book, stockBook: Bkper.Book, saleTransaction: Bkper.Transaction, purchaseTransactions: Bkper.Transaction[]): void {

    let salePrice: number = +saleTransaction.getProperty('price');

    let gainTotal = 0;
    let soldQuantity = saleTransaction.getAmount();

    for (const buyTransaction of purchaseTransactions) {
      
      let buyPrice: number = +buyTransaction.getProperty('price');
      let buyQuantity = buyTransaction.getAmount();
      
      if (soldQuantity >= buyQuantity ) {
        let gain = (salePrice * buyQuantity) - (buyPrice * buyQuantity); 
        buyTransaction
        .setProperty('sale_price', salePrice.toFixed(financialBook.getFractionDigits()))
        .setProperty('sale_date', saleTransaction.getDate())
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

        console.log(`partialBuyQuantity: ${partialBuyQuantity}`)

        let gain = (salePrice * partialBuyQuantity) - (buyPrice * partialBuyQuantity); 

        let newTransaction = stockBook.newTransaction()
        .setDate(buyTransaction.getDate())
        .setAmount(partialBuyQuantity)
        .setCreditAccount(buyTransaction.getCreditAccount())
        .setDebitAccount(buyTransaction.getDebitAccount())
        .setDescription(buyTransaction.getDescription())
        .setProperty('price', buyTransaction.getProperty('price'))
        .setProperty('sale_price', salePrice.toFixed(financialBook.getFractionDigits()))
        .setProperty('sale_date', saleTransaction.getDate())
        .post()
        .check()
        soldQuantity -= partialBuyQuantity;
        gainTotal += gain;

      }

      if (soldQuantity == 0) {
        break;
      }

    }

    if (gainTotal > 0) {
      // financialBook.newTransaction()
      // .addRemoteId(saleTransaction.getId())
      // .setAmount(gainTotal)
      // .setDescription(`sale of ${soldQuantity} #stock_gain`)
      financialBook.record(`#stock_gain ${financialBook.formatValue(gainTotal)} id:${saleTransaction.getId()}`)
    } else if (gainTotal < 0) {
      financialBook.record(`#stock_loss ${financialBook.formatValue(gainTotal * -1)} id:${saleTransaction.getId()}`)
    }

    saleTransaction.check();
  }

  export function getExcCode(book: Bkper.Book): string {
    return book.getProperty('exc_code', 'exchange_code');
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