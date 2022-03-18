namespace ForwardDateService {

    export function forwardDate(stockBookId: string, stockAccountId: string, date: string): Summary {

        let stockBook = BkperApp.getBook(stockBookId);
        let stockAccount = new StockAccount(stockBook.getAccount(stockAccountId));

        let iterator = stockBook.getTransactions(`account:'${stockAccount.getName()}' before:${date}`);
        let transactions: Bkper.Transaction[] = [];


        while (iterator.hasNext()) {
            let tx = iterator.next();
            if (!tx.isChecked()) {
                transactions.push(tx);
            }
        }

        transactions =  transactions.sort(BotService.compareToFIFO)
        let order = -transactions.length;
        for (const transaction of transactions) {
            if (!transaction.getProperty(DATE_PROP)) {
                transaction.setProperty(DATE_PROP, transaction.getDate())
            }
            if (!transaction.getProperty(HIST_QUANTITY_PROP)) {
                transaction.setProperty(HIST_QUANTITY_PROP, transaction.getProperty(ORIGINAL_QUANTITY_PROP))
            }
            if (!transaction.getProperty(HIST_ORDER_PROP)) {
                transaction.setProperty(HIST_ORDER_PROP, transaction.getProperty(ORDER_PROP))
            }
            transaction
                .deleteProperty(ORIGINAL_AMOUNT_PROP)
                .setProperty(ORIGINAL_QUANTITY_PROP, transaction.getAmount().toString())
                .setProperty(ORDER_PROP, order + '')
                .setDate(date)
                .update()
            order++;
        }

        stockAccount
        .setRealizedDate(date)
        .setForwardedDate(date)
        .update()


        let summary: Summary = {
            accountId: stockAccountId,
            result: `${transactions.length} forwarded to ${date}`
        };

        return summary;
    }
}