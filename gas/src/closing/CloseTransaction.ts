namespace closing {


    export class CloseTransaction {

        private openQuantity: Bkper.Amount;
        private openAmount: Bkper.Amount;

        constructor(openQuantity: Bkper.Amount, openAmount: Bkper.Amount) {
            this.openQuantity = openQuantity;
            this.openAmount = openAmount;
        }

        getFinantialTransaction(book: Bkper.Book, account: Bkper.Account, closingAcc: Bkper.Account, date: Date): Bkper.Transaction | null {
            if (!this.openAmount.eq(0)) {
                if (this.openQuantity.gt(0)) {
                    return book.newTransaction()
                        .from(account)
                        .to(closingAcc)
                        .setAmount(this.openAmount)
                        .setDate(book.formatDate(date))
                        .setDescription(`#closing_period`)
                        .setProperty(QUANTITY_PROP, `${this.openQuantity}`)
                        .setProperty(ORDER_PROP, '999999')
                    } else if (this.openQuantity.lt(0)) {
                        return book.newTransaction()
                        .from(closingAcc)
                        .to(account)
                        .setAmount(this.openAmount)
                        .setDate(book.formatDate(date))
                        .setDescription(`#closing_period`)
                        .setProperty(QUANTITY_PROP, `${this.openQuantity}`)
                        .setProperty(ORDER_PROP, '999999')
                }

            }
            return null;
        }


    }

}