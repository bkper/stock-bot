namespace closing {


    export class OpenTransaction {

        stockTransaction: Bkper.Transaction;

        private sale: boolean
        private date: Date;

        constructor(stockTransaction: Bkper.Transaction, sale: boolean,  date: Date) {
            this.stockTransaction = stockTransaction;
            this.sale = sale;
            this.date = date;
        }

        getFinantialTransaction(book: Bkper.Book, account: Bkper.Account, closingAcc: Bkper.Account, currentPrice: Bkper.Amount, order: number): Bkper.Transaction {
            return book.newTransaction()
                .from(this.getFromAccount(account, closingAcc))
                .to(this.getToAccount(account, closingAcc))
                .setAmount(currentPrice.times(this.getQuantity()))
                .setDate(book.formatDate(this.date))
                .setDescription(`#closing_period`)
                .setProperty(QUANTITY_PROP, `${this.getQuantity().toString()}`)
                .setProperty(ORDER_PROP, order + '')
                .setProperty(ORIGINAL_PURCHASE_PRICE, this.getOriginalPurchasePrice())
                .setProperty(ORIGINAL_SALE_PRICE, this.getOriginalSalePrice())

        }
        private getQuantity(): Bkper.Amount {
            return this.stockTransaction.getAmount();
        }


        private getFromAccount(account: Bkper.Account, closingAcc: Bkper.Account): Bkper.Account {
            return this.sale ? account : closingAcc
        }

        private getToAccount(account: Bkper.Account, closingAcc: Bkper.Account): Bkper.Account {
            return this.sale ? closingAcc : account
        }

        private getOriginalPurchasePrice(): string {
            return this.stockTransaction.getProperty(ORIGINAL_PURCHASE_PRICE) || this.stockTransaction.getProperty(PURCHASE_PRICE_PROP)
        }

        private getOriginalSalePrice(): string {
            return this.stockTransaction.getProperty(ORIGINAL_SALE_PRICE) || this.stockTransaction.getProperty(SALE_PRICE_PROP)
        }


    }

}