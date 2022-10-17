namespace ForwardDateService {

    export function forwardDate(stockBookId: string, stockAccountId: string, date: string): Summary {
        const stockBook = BkperApp.getBook(stockBookId);
        const stockAccount = new StockAccount(stockBook.getAccount(stockAccountId));
        let forwardedDateValue = stockAccount.getForwardedDateValue();
        let dateValue = +(date.replaceAll('-', ''));
        if (forwardedDateValue && dateValue < forwardedDateValue) {
            if (!isCollectionUnlocked(stockBook)) {
                throw `Cannot fix forward date: at least one book in the collection is locked or closed`;
            }
            return fixAndForwardDateForAccount(stockBook, stockAccount, date);
        } else {
            return forwardDateForAccount(stockBook, stockAccount, date, false);
        }
    }

    function fixAndForwardDateForAccount(stockBook: Bkper.Book, stockAccount: StockAccount, date: string): Summary {

        // Reset results up to current forwarded date
        RealizedResultsService.resetRealizedResultsForAccount(stockBook, stockAccount, false);

        // Fix previous forward
        let iterator = stockBook.getTransactions(`account:'${stockAccount.getName()}' after:${stockAccount.getForwardedDate()}`);
        let forwardedTransactions: Bkper.Transaction[] = [];
        while (iterator.hasNext()) {
            let tx = iterator.next();
            if (!tx.isChecked() && tx.getProperty('fwd_log')) {
                forwardedTransactions.push(tx);
            }
        }
        for (const transaction of forwardedTransactions) {
            // Get forwarded batch previous state
            let previousState = getForwardedBatchPreviousState(stockBook, stockAccount, transaction, date);
            // Return forwarded batch to previous state
            transaction
                .setDate(previousState.getDate())
                .setProperties(previousState.getProperties())
                .deleteProperty('forwarded')
                .update()
            ;
            stockAccount.pushTrashTransaction(previousState);
        }
        stockAccount.deleteTrashTransactions();

        // Reset results up to new forward date
        const resetIterator = stockBook.getTransactions(`account:'${stockAccount.getName()}' after:${date}`);
        RealizedResultsService.resetRealizedResultsForAccount(stockBook, stockAccount, false, resetIterator);

        // Set new forward date
        const newForward = forwardDateForAccount(stockBook, stockAccount, date, true);

        return {
            accountId: stockAccount.getId(),
            result: `${forwardedTransactions.length} fixed and ${newForward.result}`
        }
    }

    function forwardDateForAccount(stockBook: Bkper.Book, stockAccount: StockAccount, date: string, fixingForward: boolean): Summary {

        // Do not allow forward if account needs rebuild
        if (stockAccount.needsRebuild()) {
            return {
                accountId: stockAccount.getId(),
                result: `Cannot set forward date: account needs rebuild`
            }
        }

        const baseBook = BotService.getBaseBook(stockBook);
        const baseExcCode = BotService.getExcCode(baseBook);
        
        const stockExcCode = stockAccount.getExchangeCode();
        const financialBook = BotService.getFinancialBook(stockBook, stockExcCode);

        // Closing Date: Forward Date - 1 day
        const closingDate = new Date();
        closingDate.setTime(stockBook.parseDate(date).getTime());
        closingDate.setDate(closingDate.getDate() - 1);
        // Closing Date ISO
        const closingDateISO = Utilities.formatDate(closingDate, stockBook.getTimeZone(), "yyyy-MM-dd");

        let stockBookBalancesReport = stockBook.getBalancesReport(`account:'${stockAccount.getName()}' on:${stockBook.formatDate(closingDate)}`);
        let baseBookBalancesReport = baseBook.getBalancesReport(`account:'${stockAccount.getName()}' on:${baseBook.formatDate(closingDate)}`);
        let financialBookBalancesReport = financialBook.getBalancesReport(`account:'${stockAccount.getName()}' on:${financialBook.formatDate(closingDate)}`);

        let needToRecordLiquidationTx = true;

        // Open amount from Base Book
        const openAmountBase = baseBookBalancesReport.getBalancesContainer(stockAccount.getName()).getCumulativeBalanceRaw();
        // Open amount from Local Book
        const openAmountLocal = financialBookBalancesReport.getBalancesContainer(stockAccount.getName()).getCumulativeBalanceRaw();
        // Open quantity from Stock Book
        let openQuantity = stockBookBalancesReport.getBalancesContainer(stockAccount.getName()).getCumulativeBalanceRaw();
        if (openQuantity.eq(0) && fixingForward) {
            openQuantity = tryOpenQuantityFromLiquidationTx(stockBook, stockAccount, closingDateISO);
            if (!openQuantity.eq(0)) {
                needToRecordLiquidationTx = false;
            }
        }
        // Current price
        const fwdPrice = !openQuantity.eq(0) ? openAmountLocal.div(openQuantity) : undefined;
        // Current exchange rate
        const fwdExcRate = !openAmountLocal.eq(0) ? openAmountBase.div(openAmountLocal) : undefined;

        let iterator = stockBook.getTransactions(`account:'${stockAccount.getName()}' before:${date}`);
        let transactions: Bkper.Transaction[] = [];

        while (iterator.hasNext()) {
            let tx = iterator.next();
            if (!tx.isChecked()) {
                transactions.push(tx);
            }
        }

        transactions = transactions.sort(BotService.compareToFIFO);
        
        let newTransactions: Bkper.Transaction[] = [];
        let order = -transactions.length;

        for (const transaction of transactions) {

            // Post copy of batch in order to keep history
            let logTransaction = buildLogTransaction(stockBook, transaction).post();
            // Forward batch
            forwardBatch(transaction, logTransaction, stockExcCode, baseExcCode, fwdPrice, fwdExcRate, date, order);
            
            newTransactions.push(logTransaction);
            order++;
        }

        // Record new transaction liquidating the logs
        if (needToRecordLiquidationTx && !openQuantity.eq(0)) {
            let liquidationTransaction = buildLiquidationTransaction(stockBook, stockAccount, openQuantity, closingDate, date);
            liquidationTransaction.
                setProperty('fwd_liquidation', JSON.stringify(newTransactions.map(tx => tx.getId())))
                .post()
            ;
            newTransactions.push(liquidationTransaction);
        }

        // Check copies and liquidation transactions
        stockBook.batchCheckTransactions(newTransactions);

        // Update stock account
        updateStockAccount(stockAccount, stockExcCode, baseExcCode, fwdPrice, fwdExcRate, date);

        if (isForwardedDateSameOnAllAccounts(stockBook, date) && stockBook.getClosingDate() != closingDateISO) {
            // Prevent book from closing before last account update
            Utilities.sleep(3000);
            stockBook.setClosingDate(closingDateISO).update();
            return {
                accountId: stockAccount.getId(),
                result: `${transactions.length} forwarded to ${date} and book closed on ${stockBook.formatDate(closingDate)}`
            }
        } else {
            return {
                accountId: stockAccount.getId(),
                result: `${transactions.length} forwarded to ${date}`
            }
        }

    }

    function forwardBatch(transaction: Bkper.Transaction, transactionCopy: Bkper.Transaction, stockExcCode: string, baseExcCode: string, fwdPrice: Bkper.Amount, fwdExcRate: Bkper.Amount, date: string, order: number): void {
        if (!transaction.getProperty(DATE_PROP)) {
            transaction.setProperty(DATE_PROP, transaction.getDate());
        }
        if (!transaction.getProperty(HIST_QUANTITY_PROP)) {
            transaction.setProperty(HIST_QUANTITY_PROP, transaction.getProperty(ORIGINAL_QUANTITY_PROP));
        }
        if (!transaction.getProperty(HIST_ORDER_PROP)) {
            transaction.setProperty(HIST_ORDER_PROP, transaction.getProperty(ORDER_PROP));
        }
        if (BotService.isPurchase(transaction)) {
            transaction.setProperty(FWD_PURCHASE_PRICE_PROP, fwdPrice ? fwdPrice.toString() : undefined);
            if (stockExcCode !== baseExcCode) {
                transaction.setProperty(FWD_PURCHASE_EXC_RATE_PROP, fwdExcRate ? fwdExcRate.toString() : undefined);
            }
        }
        if (BotService.isSale(transaction)) {
            transaction.setProperty(FWD_SALE_PRICE_PROP, fwdPrice ? fwdPrice.toString() : undefined);
            if (stockExcCode !== baseExcCode) {
                transaction.setProperty(FWD_SALE_EXC_RATE_PROP, fwdExcRate ? fwdExcRate.toString() : undefined);
            }
        }
        transaction
            .deleteProperty(ORIGINAL_AMOUNT_PROP)
            .setProperty(ORIGINAL_QUANTITY_PROP, transaction.getAmount().toString())
            .setProperty(ORDER_PROP, order + '')
            .setProperty('fwd_log', transactionCopy.getId())
            .setDate(date)
            .update()
        ;
    }

    function updateStockAccount(stockAccount: StockAccount, stockExcCode: string, baseExcCode: string, fwdPrice: Bkper.Amount, fwdExcRate: Bkper.Amount, date: string): void {
        stockAccount
            .setRealizedDate(date)
            .setForwardedDate(date)
            .setForwardedPrice(fwdPrice)
        ;
        if (stockExcCode !== baseExcCode) {
            stockAccount.setForwardedExcRate(fwdExcRate);
        }
        stockAccount.update();
    }

    function isForwardedDateSameOnAllAccounts(book: Bkper.Book, forwardedDate: string): boolean {
        for (const account of book.getAccounts()) {
            const stockAccount = new StockAccount(account)
            if (stockAccount.isPermanent() && !stockAccount.isArchived() && stockAccount.getExchangeCode()) {
                if (stockAccount.getForwardedDate() != forwardedDate) {
                    return false
                }
            }
        }
        return true;
    }

    function buildLogTransaction(book: Bkper.Book, transaction: Bkper.Transaction): Bkper.Transaction {
        return book.newTransaction()
            .setAmount(transaction.getAmount())
            .from(transaction.getCreditAccount())
            .to(transaction.getDebitAccount())
            .setDate(transaction.getDate())
            .setDescription(transaction.getDescription())
            .setProperties(transaction.getProperties())
            .setProperty('forwarded', 'true')
        ;
    }

    function buildLiquidationTransaction(book: Bkper.Book, stockAccount: StockAccount, quantity: Bkper.Amount, closingDate: Date, forwardDate: string): Bkper.Transaction {
        const fromAccount = quantity.lt(0) ? stockAccount.getName() : 'Buy';
        const toAccount = quantity.lt(0) ? 'Sell' : stockAccount.getName();
        return book.newTransaction()
            .setAmount(quantity.abs())
            .from(fromAccount)
            .to(toAccount)
            .setDate(closingDate)
            .setDescription(`${quantity.times(-1)} units forwarded to ${forwardDate}`)
        ;
    }

    function isCollectionUnlocked(baseBook: Bkper.Book): boolean {
        let books = baseBook.getCollection().getBooks();
        for (const book of books) {
            let lockDate = book.getLockDate();
            let closingDate = book.getClosingDate();
            if (lockDate && lockDate !== '1900-00-00') {
                return false;
            }
            if (closingDate && closingDate !== '1900-00-00') {
                return false;
            }
        }
        return true;
    }

    function getForwardedBatchPreviousState(book: Bkper.Book, stockAccount: StockAccount, transaction: Bkper.Transaction, date: string): Bkper.Transaction {
        const previousStateId = transaction.getProperty('fwd_log');
        if (!previousStateId) {
            return transaction;
        }
        const previousState = book.getTransaction(previousStateId);
        if (previousState.getDateValue() <= +(date.replaceAll('-', ''))) {
            return previousState;
        }
        stockAccount.pushTrashTransaction(previousState);
        return getForwardedBatchPreviousState(book, stockAccount, previousState, date);
    }

    function tryOpenQuantityFromLiquidationTx(book: Bkper.Book, stockAccount: StockAccount, closingDate: string): Bkper.Amount {
        let iterator = book.getTransactions(`account:'${stockAccount.getName()}' on:${closingDate}`);
        while (iterator.hasNext()) {
            let tx = iterator.next();
            if (tx.getProperty('fwd_liquidation')) {
                if (BotService.isPurchase(tx)) {
                    return tx.getAmount();
                }
                if (BotService.isSale(tx)) {
                    return tx.getAmount().times(-1);
                }
            }
        }
        return BkperApp.newAmount(0);
    }

}
