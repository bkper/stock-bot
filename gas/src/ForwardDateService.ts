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
            transaction
            .setProperty('date', transaction.getDate())
            .setProperty('hist_quantity', transaction.getProperty(ORIGINAL_QUANTITY_PROP))
            .setProperty('hist_order', transaction.getProperty(ORDER_PROP))
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