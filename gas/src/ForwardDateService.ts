namespace ForwardDateService {

    export function forwardDate(stockBookId: string, stockAccountId: string, date: string): Summary {

        let stockBook = BkperApp.getBook(stockBookId);
        let stockAccount = new StockAccount(stockBook.getAccount(stockAccountId));
        const stockExcCode = stockAccount.getExchangeCode();

        let baseBook = BotService.getBaseBook(stockBook);
        const baseExcCode = BotService.getExcCode(baseBook);
        let financialBook = BotService.getFinancialBook(stockBook, stockAccount.getExchangeCode());

        // Closing Date: Forward Date - 1 day
        const closingDate = new Date();
        closingDate.setTime(stockBook.parseDate(date).getTime());
        closingDate.setDate(closingDate.getDate() - 1);

        let stockBookBalancesReport = stockBook.getBalancesReport(`account:'${stockAccount.getName()}' on:${stockBook.formatDate(closingDate)}`);
        let baseBookBalancesReport = baseBook.getBalancesReport(`account:'${stockAccount.getName()}' on:${baseBook.formatDate(closingDate)}`);
        let financialBookBalancesReport = financialBook.getBalancesReport(`account:'${stockAccount.getName()}' on:${financialBook.formatDate(closingDate)}`);

        // Open amount from Base Book
        const openAmountBase = baseBookBalancesReport.getBalancesContainer(stockAccount.getName()).getCumulativeBalanceRaw();
        // Open amount from Local Book
        const openAmountLocal = financialBookBalancesReport.getBalancesContainer(stockAccount.getName()).getCumulativeBalanceRaw();
        // Open quantity from Stock Book
        const openQuantity = stockBookBalancesReport.getBalancesContainer(stockAccount.getName()).getCumulativeBalanceRaw();
        // Current price
        const fwdPrice = !openQuantity.eq(0) ? openAmountLocal.div(openQuantity) : undefined;
        // Current exchange rate
        const fwdExcRate = !openAmountLocal.eq(0) ? openAmountBase.div(openAmountLocal) : undefined;


        // Do not allow forward if account needs rebuild
        if (stockAccount.needsRebuild()) {
            return {
                accountId: stockAccountId,
                result: `Cannot set forward date: account needs rebuild`
            }
        }

        let iterator = stockBook.getTransactions(`account:'${stockAccount.getName()}' before:${date}`);
        let transactions: Bkper.Transaction[] = [];

        while (iterator.hasNext()) {
            let tx = iterator.next();
            if (!tx.isChecked()) {
                transactions.push(tx);
            }
        }

        transactions = transactions.sort(BotService.compareToFIFO);
        let order = -transactions.length;

        for (const transaction of transactions) {
            // Forward transaction
            forwardTransaction(transaction, stockExcCode, baseExcCode, fwdPrice, fwdExcRate, date, order);
            order++;
        }

        // Update stock account
        updateStockAccount(stockAccount, stockExcCode, baseExcCode, fwdPrice, fwdExcRate, date);

        const closingDateISO = Utilities.formatDate(closingDate, stockBook.getTimeZone(), "yyyy-MM-dd");
        if (isForwardedDateSameOnAllAccounts(stockBook, date) && stockBook.getClosingDate() != closingDateISO) {
            stockBook.setClosingDate(closingDateISO).update();
            return {
                accountId: stockAccountId,
                result: `${transactions.length} forwarded to ${date} and book closed on ${stockBook.formatDate(closingDate)}`
            }
        } else {
            return {
                accountId: stockAccountId,
                result: `${transactions.length} forwarded to ${date}`
            }
        }

    }

    function forwardTransaction(transaction: Bkper.Transaction, stockExcCode: string, baseExcCode: string, fwdPrice: Bkper.Amount, fwdExcRate: Bkper.Amount, date: string, order: number): void {
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
}
