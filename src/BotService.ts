

namespace BotService {

  export function getStockBook(baseBook: Bkper.Book): Bkper.Book {
    let connectedBooks = baseBook.getCollection().getBooks();
    for (const connectedBook of connectedBooks) {
      let fractionDigits = connectedBook.getFractionDigits();
      if (fractionDigits != null && fractionDigits == 0) {
        return connectedBook;
      }
    }
    return null;
  }

  export function getBotViewTemplate(baseBookId: string, baseAccountId: string): GoogleAppsScript.HTML.HtmlOutput {
    let baseBook = BkperApp.getBook(baseBookId);
    let baseAccount = baseBook.getAccount(baseAccountId);

    let stockBook = BotService.getStockBook(baseBook);

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
      id: stockAccount.getId()
    }

    return template.evaluate().setTitle('Stock Bot');
  }


  export function gainLossIncremental(stockBookId: string, stockAccountId: string): void {
    let stockBook = BkperApp.getBook(stockBookId);
    let stockAccount = stockBook.getAccount(stockAccountId);

  }

  export function gainLossRebuild(stockBookId: string, stockAccountId: string): void {

  }


  function sell(baseBook: Bkper.Book, connectedBook: Bkper.Book, sellTransaction: Bkper.Transaction): void {

    let iterator = connectedBook.getTransactions(`account:'${sellTransaction.getCreditAccountName()}' is:unchecked`);
    let buyTransactions: Bkper.Transaction[] = [];
    while (iterator.hasNext()) {
      let tx = iterator.next();
      //Make sure get buy only
      if (tx.getDebitAccountName() == sellTransaction.getCreditAccountName()) {
        buyTransactions.push(tx);
      }
    }

    //FIFO
    buyTransactions = buyTransactions.reverse();

    let sellPrice: number = +sellTransaction.getProperty('price');

    let gainTotal = 0;
    let soldQuantity = sellTransaction.getAmount();

    for (const buyTransaction of buyTransactions) {
      
      let buyPrice: number = +buyTransaction.getProperty('price');
      let buyQuantity = buyTransaction.getAmount();
      
      if (soldQuantity >= buyQuantity ) {
        let gain = (sellPrice * buyQuantity) - (buyPrice * buyQuantity); 
        buyTransaction
        .setProperty('sell_price', sellPrice.toFixed(baseBook.getFractionDigits()))
        .setProperty('sell_date', sellTransaction.getDate())
        .addRemoteId(sellTransaction.getId())
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

        let gain = (sellPrice * partialBuyQuantity) - (buyPrice * partialBuyQuantity); 

        let newTransaction = connectedBook.newTransaction()
        .setDate(buyTransaction.getDate())
        .setAmount(partialBuyQuantity)
        .setCreditAccount(buyTransaction.getCreditAccount())
        .setDebitAccount(buyTransaction.getDebitAccount())
        .setDescription(buyTransaction.getDescription())
        .setProperty('price', buyTransaction.getProperty('price'))
        .setProperty('code', buyTransaction.getProperty('code'))
        .setProperty('sell_price', sellPrice.toFixed(baseBook.getFractionDigits()))
        .setProperty('sell_date', sellTransaction.getDate())
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
      baseBook.record(`#stock_gain ${baseBook.formatValue(gainTotal)}`)
    } else if (gainTotal < 0) {
      baseBook.record(`#stock_loss ${baseBook.formatValue(gainTotal * -1)}`)
    }

    sellTransaction.check();
  }



}
