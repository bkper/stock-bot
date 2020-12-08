Manage Stock Book in sync with Financial Book upon buying and seling inventory instruments.

![Stock Bot](https://docs.google.com/drawings/d/e/2PACX-1vQSjFxT6jVtwaiuDOEaDOaruFHWDp8YtT91lNUCw4BruKm3ZED__g1D4-5iAoi-J23j4v55Tk6ETg9R/pub?w=949&h=436)

It works by monitoring Financial Books and tracking quantities of instruments bought or sold in a separate Stock Book.

The process of tracking realized gains and losses upon sales follows the FIFO (first in / first out) method.


## Configuration

Financial and Instruments Books **should be in same [Collection](https://help.bkper.com/en/articles/4208937-collections)**.

The Instruments Book is identified by a single book in the Collection with the **decimal places set to 0 (zero)**.

The bot interact with the following properties:

### Account Properties

- ```stock_fees_account```: The fees account used by the exchange account. The exchange account is identified by having an associated fees account.
- ```stock_unreal_account```: The liability account used to track unrealized gains/losses upon intermediary valuations of the inventory instruments. Default to "XXX Unrealized".
- ```stock_gain_account```: The Incoming account used to track realized gains upon stock sales. Default to "XXX Realized Gain".
- ```stock_loss_account```: The Outgoing account used to track realized gains upon stock sales. Default to "XXX Realized Loss"

### Group Properties

- ```stock_exc_code```: Defines the exchange code of the instruments that will have quantities mirrored into the stocks book. Only transactions with accounts withing groups with ```stock_exc_code``` set will be mirrored.


### Transaction Properties 

- ```quantity```: The quantity of the instruments to track.

The Bot also add the following properties to the generated transaction in the Instruments Book:

- ```purchase_price```: The price the instrument was bought.
- ```original_quantity```: The original quantity used for rebuilding FIFO gains/losses if needed
- ```original_amount```: The original financial transaction amount for buy or sell the instrument 
- ```sale_price```: The price the instrument was sold.
- ```sale_amount```: The financial amount the instrument was sold.
- ```sale_date```: The date the instrument was sold.
- ```gain_amount```: The total gain obtained from the instrument sale.
- ```order```: Used to reorder transactions on same day.