namespace closing {


    class TransactionsBatch {
        private book: Bkper.Book
        private transactions: Bkper.Transaction[] = []
        constructor(book: Bkper.Book) {
            this.book = book;
        }

        add(transaction: Bkper.Transaction) {
            this.transactions.push(transaction)
        }

        createTransactions(): void {
            this.book.batchCreateTransactions(this.transactions);
        }
    }

    export class ClosingInstruments {

        private book: Bkper.Book;
        private newClosing: Date;
        private newClosingD1: Date;
        private lastClosing: Date;

        private openTransactions = new Map<string, OpenTransaction[]>();

        constructor(book: Bkper.Book, lastClosingDate: string, newClosingDate: string) {
            this.book = book;
            // New closing date
            const newClosing = new Date();
            newClosing.setTime(this.book.parseDate(newClosingDate).getTime());
            this.newClosing = newClosing;

            const newClosingD1 = new Date();
            newClosingD1.setTime(this.book.parseDate(newClosingDate).getTime());
            newClosingD1.setDate(newClosingD1.getDate() + 1);
            this.newClosingD1 = newClosingD1;

            // Last closing date
            const lastClosing = new Date();
            lastClosing.setTime(this.book.parseDate(lastClosingDate).getTime())
            this.lastClosing = lastClosing;
        };

        recordCloseAndOpenTransactions() {

            //TODO validate if there is no account with "needs_rebuild"
            //TODO optimize to make a single call per book (is currently doing 2)
            let batches = this.createOpenTransactions();
            batches = batches.concat(this.createClosingTransactions());
            batches.forEach(b => b.createTransactions())
        }

        createOpenTransactions(): TransactionsBatch[] {
            
            const batches: TransactionsBatch[] = []

            let stockBook = this.getStockBook(this.book);
            const openBatchesQuery = `is:unchecked before:${this.book.formatDate(this.newClosingD1)}`
            const iterator = stockBook.getTransactions(openBatchesQuery);
            
            while (iterator.hasNext()) {
                const transaction = iterator.next();
                if (transaction.getDebitAccountName() == SELL_ACCOUNT_NAME) {
                    let transactions = this.openTransactions.get(transaction.getCreditAccountName());
                    if (!transactions) {
                        transactions = [];
                        this.openTransactions.set(transaction.getCreditAccountName(), transactions)
                    }
                    transactions.push(new closing.OpenTransaction(transaction, true, this.newClosing))
                } else if (transaction.getCreditAccountName() == BUY_ACCOUNT_NAME) {
                    let transactions = this.openTransactions.get(transaction.getDebitAccountName());
                    if (!transactions) {
                        transactions = [];
                        this.openTransactions.set(transaction.getDebitAccountName(), transactions)
                    }
                    transactions.push(new closing.OpenTransaction(transaction, false, this.newClosing))
                }
            }

            let stockBookBalancesReport = stockBook.getBalancesReport(`group:'${TRADING}' on:${this.book.formatDate(this.newClosing)}`);

            // Financial Books
            let books = this.book.getCollection().getBooks();
            for (const book of books) {
                let bookExcCode = book.getProperty(EXC_CODE_PROP);
                if (bookExcCode) {
                    let financialBookBalancesReport = book.getBalancesReport(`group:'${TRADING}' on:${this.book.formatDate(this.newClosing)}`);
                    let batch = new  TransactionsBatch(book)

                    for (const group of book.getGroups()) {
                        if (group.getProperty(STOCK_EXC_CODE_PROP) == bookExcCode) {
                            const accounts = group.getAccounts();

                            for (const account of accounts) {
                                const openStockTransactions = this.openTransactions.get(account.getName())
                                if (openStockTransactions){
                                    const openQuantity = stockBookBalancesReport.getBalancesContainer(account.getName()).getCumulativeBalance();
                                    if (openQuantity.eq(0)) {
                                        continue;
                                    }
                                    // Get open amount from Financial Book
                                    const openAmount = financialBookBalancesReport.getBalancesContainer(account.getName()).getCumulativeBalance();
                                    const currentPrice = openAmount.div(openQuantity)
                                    openStockTransactions.sort(compareTo)
                                    let order = -openStockTransactions.length;
                                    let closingAcc = this.getClosingAccount(book, bookExcCode);
                                    for (const openStockTransaction of openStockTransactions) {
                                        batch.add(openStockTransaction.getFinantialTransaction(book, account, closingAcc, currentPrice, order))                                     
                                        order++;
                                    }
                                }
                            }
                        }
                    }
                    batches.push(batch)
                }
            }
            //TODO implement
            return batches;
        }

        createClosingTransactions(): TransactionsBatch[] {
            let stockBook = this.getStockBook(this.book);

            // Save balances report from Stock Book
            let stockBookBalancesReport = stockBook.getBalancesReport(`group:'${TRADING}' on:${this.book.formatDate(this.newClosing)}`);

            const batches: TransactionsBatch[] = []

            // Financial Books
            let books = this.book.getCollection().getBooks();
            for (const book of books) {
                let bookExcCode = book.getProperty(EXC_CODE_PROP);
                if (bookExcCode) {
                    // Save balances report from Financial Book
                    let financialBookBalancesReport = book.getBalancesReport(`group:'${TRADING}' on:${this.book.formatDate(this.newClosing)}`);
                    let closingAcc = this.getClosingAccount(book, bookExcCode);
                    // Variable to store transactions
                    let batch = new  TransactionsBatch(book)
                    for (const group of book.getGroups()) {
                        if (group.getProperty(STOCK_EXC_CODE_PROP) == bookExcCode) {
                            for (const account of group.getAccounts()) {
                                // Get open quantity from Stock Book
                                let openQuantity = stockBookBalancesReport.getBalancesContainer(account.getName()).getCumulativeBalance();
                                // Get open amount from Financial Book
                                let openAmount = financialBookBalancesReport.getBalancesContainer(account.getName()).getCumulativeBalance();
                                let closeTransaction = new closing.CloseTransaction(openQuantity, openAmount);
                                let tx = closeTransaction.getFinantialTransaction(book, account, closingAcc, this.newClosing)
                                if (tx) {
                                    batch.add(tx)
                                }
                            }
                        }
                    }
                    batches.push(batch)
                };
            };
            
            return batches;

            // Update book properties
            // this.updateBookProperties(this.newClosing, this.lastClosing);
            // Last step here: update state machine
            // this.book.setProperty(CLOSING_STEP_PROP, '1').update();
        }

        private getClosingAccount(book: Bkper.Book, bookExcCode: string) {
            let closingAcc = book.getAccount(`Closing_${bookExcCode}`);
            if (!closingAcc) {
                let closingGroup = book.getGroup('Closing');
                if (!closingGroup) {
                    closingGroup = book.newGroup().setName('Closing').create();
                };
                closingAcc = book.newAccount()
                    .setName(`Closing_${bookExcCode}`)
                    .setType(BkperApp.AccountType.LIABILITY)
                    .addGroup(closingGroup)
                    .create();
            };
            return closingAcc;
        }

        updateBookProperties(newDate: Date, previousDate: Date) {
            // Update report_closing_date
            this.book.setProperty(REPORT_CLOSING_DATE_PROP, this.book.formatDate(newDate)).update();
            // Also save previous closing date
            this.book.setProperty(PREV_CLOSING_DATE_PROP, this.book.formatDate(previousDate)).update();
        }

        private getStockBook(book: Bkper.Book): Bkper.Book {
            if (book.getCollection()) {
                let connectedBooks = book.getCollection().getBooks();
                for (const connectedBook of connectedBooks) {
                    if (connectedBook.getProperty(STOCK_BOOK_PROP)) {
                        return connectedBook;
                    };
                    let fractionDigits = connectedBook.getFractionDigits();
                    if (fractionDigits == 0) {
                        return connectedBook;
                    };
                };
            };
            throw `Stock book not found on ${this.book.getCollection().getName()}`
        }

    }

    function compareTo(tx1: OpenTransaction, tx2: OpenTransaction): number {
        if (tx1.stockTransaction.getDateValue() != tx2.stockTransaction.getDateValue()) {
          return tx1.stockTransaction.getDateValue() - tx2.stockTransaction.getDateValue();
        }
        if (tx1.stockTransaction.getProperty(ORDER_PROP) != null && tx2.stockTransaction.getProperty(ORDER_PROP) != null) {
          let order1 = +tx1.stockTransaction.getProperty(ORDER_PROP);
          let order2 = +tx2.stockTransaction.getProperty(ORDER_PROP);
          console.log(`${order1} | ${order2}`)
          return order1 - order2;
        }
        if (tx1.stockTransaction.getCreatedAt() && tx2.stockTransaction.getCreatedAt()) {
          return tx1.stockTransaction.getCreatedAt().getMilliseconds() - tx2.stockTransaction.getCreatedAt().getMilliseconds();
        }
        return 0;
      }    

}