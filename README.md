Keep stocks/bonds Instruments Book in sync with Financial Book upon buying and seling instruments.

![Stock Bot](https://docs.google.com/drawings/d/e/2PACX-1vQSjFxT6jVtwaiuDOEaDOaruFHWDp8YtT91lNUCw4BruKm3ZED__g1D4-5iAoi-J23j4v55Tk6ETg9R/pub?w=949&h=436)

It works by monitoring Financial Books and tracking quantities of instruments bought or sold in a separate Instruments Book.

The process of seling the stock/bond follows the FIFO (first in / first out) method.

Orders partially sold are splitted and the price tracked into a ```sold_for``` transaction property, to calculate gains/losses.


## Configuration

Financial and Instruments Books **should be in same [Collection](https://help.bkper.com/en/articles/4208937-collections)**.

The Instruments Book is identified by a single book in the Collection with the **decimal places set to 0 (zero)**.

The bot interact with the following properties:

### Group Properties

- ```stock_exc_code```: Defines the exchange code of the instruments that will have quantities mirrored into the stocks book. Only transactions with accounts withing groups with ```stock_exc_code``` set will be mirrored.

### Transaction Properties 

- ```quantity```: The quantity of the instruments to track.

The Bot also add the following properties to the generated transaction in the Quantities Book:

- ```price```: The price the instrument was bought.
- ```sold_for```: The price the instrument was sold.
