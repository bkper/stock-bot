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

  export function getBotViewTemplate(baseBookId: string, baseAccountId: string): GoogleAppsScript.HTML.HtmlOutput {
    let baseBook = BkperApp.getBook(baseBookId);
    let baseAccount = baseBook.getAccount(baseAccountId);

    let stockBook = getStockBook(baseBook);

    if (stockBook == null) {
      throw 'No book with 0 decimal places found in the collection';
    }

    let stockAccount = stockBook.getAccount(baseAccount.getName());

    const template = HtmlService.createTemplateFromFile('BotView');
  
    template.book = {
      id: stockBook.getId(),
      name: stockBook.getName(),
    }
    template.account = {
      id: stockAccount.getId(),
      name: stockAccount.getName()
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

  export function calculateRealizedResults(stockBookId: string, stockAccountId: string): void {
    let stockBook = BkperApp.getBook(stockBookId);
    let stockAccount = stockBook.getAccount(stockAccountId);

    let iterator = stockBook.getTransactions(`account:'${stockAccount.getName()}' is:unchecked`);

    let excCode = getStockExchangeCode(stockAccount);
    
    let financialBook = getFinancialBook(stockBook, excCode);
    let saleTransactions: Bkper.Transaction[] = [];
    while (iterator.hasNext()) {
      let tx = iterator.next();
      //Make sure get sales only
      if (tx.getCreditAccountName() == stockAccount.getName()) {
        saleTransactions.push(tx);
      }
    }

    //FIFO
    saleTransactions = saleTransactions.reverse();

    for (const saleTransaction of saleTransactions) {
      processSale(financialBook, stockBook, saleTransaction);
    }
  }


  function processSale(financialBook: Bkper.Book, stockBook: Bkper.Book, saleTransaction: Bkper.Transaction): void {

    let iterator = stockBook.getTransactions(`account:'${saleTransaction.getCreditAccountName()}' is:unchecked`);
    let buyTransactions: Bkper.Transaction[] = [];
    while (iterator.hasNext()) {
      let tx = iterator.next();
      //Make sure get buy only
      if (tx.getDebitAccountName() == saleTransaction.getCreditAccountName()) {
        buyTransactions.push(tx);
      }
    }

    //FIFO
    buyTransactions = buyTransactions.reverse();

    let salePrice: number = +saleTransaction.getProperty('price');

    let gainTotal = 0;
    let soldQuantity = saleTransaction.getAmount();

    for (const buyTransaction of buyTransactions) {
      
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
        .setProperty('code', buyTransaction.getProperty('code'))
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
      financialBook.record(`#stock_gain ${financialBook.formatValue(gainTotal)} id:${saleTransaction}`)
    } else if (gainTotal < 0) {
      financialBook.record(`#stock_loss ${financialBook.formatValue(gainTotal * -1)} id:${saleTransaction}`)
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