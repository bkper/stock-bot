Manage Stock Book in sync with Financial Books upon buying and seling inventory instruments.

![Stock Bot](https://docs.google.com/drawings/d/e/2PACX-1vQSjFxT6jVtwaiuDOEaDOaruFHWDp8YtT91lNUCw4BruKm3ZED__g1D4-5iAoi-J23j4v55Tk6ETg9R/pub?w=2848&h=1306)

It works by monitoring Financial Books and tracking quantities of instruments bought or sold in a separate Stock Book.

The process of tracking realized gains and losses upon sales follows the FIFO ([First-In, First-Out](https://medium.com/magnimetrics/first-in-first-out-fifo-inventory-costing-f0bc00096a59)) method.


## Configuration

Financial and Instruments Books **must be in the same [Collection](https://help.bkper.com/en/articles/4208937-collections)**.

Only a single Instruments Book should be defined per Collection.

The Instruments Book is identified by a single book in the Collection with the **decimal places set to 0 (zero)** or by the ```stock_book``` property set to ```true```.

The Stock Bot interacts with the following properties:

### Book Properties

#### Financial Books
- ```exc_code```: Required - The book exchange code to match the ```stock_exc_code```.
#### Instruments Book
- ```stock_historical```: Optional - true/false - Defines if realized results calculations should consider historical values. If set to false or not present, updated values will be used instead. See [Forward Date Service](#forward-date-service).

### Group Properties

- ```stock_exc_code```: Required - Defines the exchange code of the instrument that will have quantities mirrored into the Stock Book. Only transactions with accounts within groups with ```stock_exc_code``` set will be mirrored.

### Account Properties

- ```stock_fees_account```: Optional - The fees account used by the broker account. The broker account is identified by having an associated fees account.

### Transaction Properties 

- ```quantity```: Required - The quantity of the instruments to track.


## Realized Results Service

When calculating realized results, the market value of remaining instruments can be automatically adjusted on Financial Books to match the last realized price of that instrument. This valuation procedure is known as [Mark-To-Market](https://www.investopedia.com/terms/m/marktomarket.asp). 

The Stock Bot adds the following properties to the generated transactions in the Instruments Book:

- ```purchase_amount/fwd_purchase_amount```: The financial amount the instrument was bought.
- ```purchase_price/fwd_purchase_price```: The price the instrument was bought.
- ```purchase_exc_rate/fwd_purchase_exc_rate```: The exchange rate (local currency to base currency) when the instrument was bought.
- ```sale_amount/fwd_sale_amount```: The financial amount the instrument was sold.
- ```sale_price/fwd_sale_price```: The price the instrument was sold.
- ```sale_exc_rate/fwd_sale_exc_rate```: The exchange rate (local currency to base currency) when the instrument was sold.
- ```sale_date```: The date when the instrument was sold.
- ```order```: Index used to reorder transactions that happened on the same day.
- ```original_quantity```: The original quantity of the instrument (used to rebuild FIFO gains/losses if needed).

**Observation:**
Properties starting with ```fwd``` have the same meaning as their peers. However, their values may differ if a [Forward Date](#forward-date-service) was set to that instrument.


## Forward Date Service

In order to [close a period](https://help.bkper.com/en/articles/6000644-closing-a-period) and [set a closing date](https://help.bkper.com/en/articles/5100445-book-closing-and-lock-dates) to the Stock Book, open instruments must be carried to the next period. The proper way to do so is by setting a Forward Date to the accounts in the Instruments Book.

Each open batch will have its date and prices updated. When the last instrument is successfully forwarded a closing date will be set on the Stock Book one day before the Forward Date.

Once an instrument is forwarded, future FIFO calculations will consider updated prices. To calculate gains/losses over historical prices, the property ```stock_historical``` must be set to ```true``` on the Instruments Book.

When forwarding instruments, the Stock Bot also adds the following properties to the transactions:

- ```date```: The date when the transaction has occurred.
- ```hist_order```: The historical index the transaction had before being forwarded.
- ```hist_quantity```: The historical quantity of the instrument (used to rebuild FIFO gains/losses if needed).
