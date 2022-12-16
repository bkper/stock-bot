namespace BotService {

    export function auditBooks(bookId: string): void {
        let book = BkperApp.getBook(bookId);
        let connectedBooks = book.getCollection().getBooks();
        connectedBooks.forEach(b => {
            b.audit();
        });
    }

    export function getAccountQuery(stockAccount: StockAccount, full: boolean, beforeDate?: string) {
        let query = `account:'${stockAccount.getName()}'`;

        if (!full && stockAccount.getForwardedDate()) {
            query += ` after:${stockAccount.getForwardedDate()}`
        }

        if (beforeDate) {
            query += ` before:${beforeDate}`
        }
        return query;
    }

    export function calculateGainBaseNoFX(gainLocal: Bkper.Amount, purchaseRate: Bkper.Amount, saleRate: Bkper.Amount, shortSale: boolean): Bkper.Amount {
        if (!purchaseRate || !saleRate) {
            return BkperApp.newAmount(0);
        }
        if (shortSale) {
            return gainLocal.times(purchaseRate);
        } else {
            return gainLocal.times(saleRate)
        }
    }

    export function calculateGainBaseWithFX(purchaseAmount: Bkper.Amount, purchaseRate: Bkper.Amount, saleAmount: Bkper.Amount, saleRate: Bkper.Amount): Bkper.Amount {
        if (!purchaseRate || !saleRate) {
            return BkperApp.newAmount(0);
        }
        return saleAmount.times(saleRate).minus(purchaseAmount.times(purchaseRate))
    }

    export function getFwdExcRate(stockTransaction: Bkper.Transaction, fwdExcRateProp: string, fallbackExcRate: Bkper.Amount): Bkper.Amount {
        if (stockTransaction.getProperty(fwdExcRateProp)) {
            return BkperApp.newAmount(stockTransaction.getProperty(fwdExcRateProp))
        }
        return fallbackExcRate;
    }

    export function getExcRate(baseBook: Bkper.Book, financialBook: Bkper.Book, stockTransaction: Bkper.Transaction, excRateProp: string): Bkper.Amount {
        if (baseBook.getProperty(EXC_CODE_PROP) == financialBook.getProperty(EXC_CODE_PROP)) {
            return undefined;
        }
        if (!stockTransaction.getRemoteIds()) {
            return undefined;
        }

        //Already set
        if (stockTransaction.getProperty(excRateProp)) {
            return BkperApp.newAmount(stockTransaction.getProperty(excRateProp))
        }

        for (const remoteId of stockTransaction.getRemoteIds()) {
            try {
                const financialTransaction = financialBook.getTransaction(remoteId);
                const baseIterator = baseBook.getTransactions(`remoteId:${financialTransaction.getId()}`);
                while (baseIterator.hasNext()) {
                    const baseTransaction = baseIterator.next();
                    if (baseTransaction.getProperty(EXC_RATE_PROP, 'exc_base_rate')) {
                        return BkperApp.newAmount(baseTransaction.getProperty(EXC_RATE_PROP, 'exc_base_rate'));
                    }
                }
            } catch (err) {
                Logger.log(err)
            }
        }

        return undefined;
    }

    export function getBaseBook(book: Bkper.Book): Bkper.Book {
        if (book.getCollection() == null) {
            //@ts-ignore
            console.log(`Collection of book ${book.getName()} id ${book.getId()}: ${book.wrapped}`)
            return null;
        }
        let connectedBooks = book.getCollection().getBooks();
        for (const connectedBook of connectedBooks) {
            if (connectedBook.getProperty(EXC_BASE_PROP)) {
                return connectedBook;
            }
        }
        for (const connectedBook of connectedBooks) {
            if (connectedBook.getProperty(EXC_CODE_PROP) == 'USD') {
                return connectedBook;
            }
        }
        console.log('No base book')
        return null;
    }

    export function getStockBook(book: Bkper.Book): Bkper.Book {
        if (book.getCollection() == null) {
            return null;
        }
        let connectedBooks = book.getCollection().getBooks();
        for (const connectedBook of connectedBooks) {
            if (connectedBook.getProperty(STOCK_BOOK_PROP)) {
                return connectedBook;
            }
            let fractionDigits = connectedBook.getFractionDigits();
            if (fractionDigits == 0) {
                return connectedBook;
            }
        }
        return null;
    }

    export function getFinancialBook(book: Bkper.Book, excCode?: string): Bkper.Book {
        if (book.getCollection() == null) {
            return null;
        }
        let connectedBooks = book.getCollection().getBooks();
        for (const connectedBook of connectedBooks) {
            let excCodeConnectedBook = getExcCode(connectedBook);
            let fractionDigits = connectedBook.getFractionDigits();
            if (fractionDigits != 0 && excCode == excCodeConnectedBook) {
                return BkperApp.getBook(connectedBook.getId());
            }
        }
        return null;
    }

    export function isSale(transaction: Bkper.Transaction): boolean {
        return transaction.isPosted() && transaction.getDebitAccount().getType() == BkperApp.AccountType.OUTGOING;
    }

    export function isPurchase(transaction: Bkper.Transaction): boolean {
        return transaction.isPosted() && transaction.getCreditAccount().getType() == BkperApp.AccountType.INCOMING;
    }

    export function getExcCode(book: Bkper.Book): string {
        return book.getProperty(EXC_CODE_PROP, 'exchange_code');
    }

    export function compareToFIFO(tx1: Bkper.Transaction, tx2: Bkper.Transaction): number {

        let ret = tx1.getDateValue() - tx2.getDateValue()

        if (ret == 0) {
            const order1 = tx1.getProperty(ORDER_PROP) ? +tx1.getProperty(ORDER_PROP) : 0;
            const order2 = tx2.getProperty(ORDER_PROP) ? +tx2.getProperty(ORDER_PROP) : 0;
            ret =  order1 - order2;
        }

        if (ret == 0 && tx1.getCreatedAt() && tx2.getCreatedAt()) {
            ret = tx1.getCreatedAt().getMilliseconds() - tx2.getCreatedAt().getMilliseconds();
        }

        return ret;
    }

    export function getUncalculatedOrRebuildAccounts(stockBook: Bkper.Book): Bkper.Account[] {

        let validationAccountsMap = new Map<string, ValidationAccount>();

        for (const account of stockBook.getAccounts()) {
            if (account.isPermanent()) {
                validationAccountsMap.set(account.getName(), new ValidationAccount(account));
            }
        }

        const iterator = stockBook.getTransactions(`is:unchecked`);
        while (iterator.hasNext()) {
            const transaction = iterator.next();
            const account = transaction.getCreditAccount().isPermanent() ? transaction.getCreditAccount() : transaction.getDebitAccount();
            let validationAccount = validationAccountsMap.get(account.getName());
            if (!validationAccount) {
                continue;
            }
            const contraAccount = transaction.getCreditAccount().isPermanent() ? transaction.getDebitAccount() : transaction.getCreditAccount();
            if (contraAccount.getName() == BUY_ACCOUNT_NAME) {
                validationAccount.pushUncheckedPurchase(transaction);
            }
            if (contraAccount.getName() == SELL_ACCOUNT_NAME) {
                validationAccount.pushUncheckedSale(transaction);
            }
        }

        let accounts: Bkper.Account[] = [];

        validationAccountsMap.forEach(validationAccount => {
            if (validationAccount.needsRebuild()) {
                accounts.push(validationAccount.getAccount());
                return;
            }
            if (validationAccount.hasUncalculatedResults()) {
                accounts.push(validationAccount.getAccount());
            }
        });

        return accounts;
    }

}
