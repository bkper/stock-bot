import { Book } from "bkper";
import { STOCK_HISTORICAL_PROP, EXC_HISTORICAL_PROP } from "./constants";
import { EventHandler } from "./EventHandler";
import { isStockBook, getBaseBook } from "./BotService";

export class EventHandlerBookUpdated extends EventHandler {

    protected async processObject(book: Book, connectedBook: Book, event: bkper.Event): Promise<string> {

        // let connectedCode = getBaseCode(connectedBook);
        let response = '';
        let baseBook = getBaseBook(book);

        if (isStockBook(book)) {

            // if (book.getPageSize() != connectedBook.getPageSize()) {
            //     connectedBook.setPageSize(book.getPageSize())
            //     response += ` page size: ${book.getPageSize()}`
            // }

            // if (book.getPeriod() != connectedBook.getPeriod()) {
            //     connectedBook.setPeriod(book.getPeriod())
            //     response += ` period: ${book.getPeriod()}`
            // }

            // if (book.getLockDate() != connectedBook.getLockDate()) {
            //     connectedBook.setLockDate(book.getLockDate())
            //     response += ` lock date: ${book.getLockDate()}`
            // }

            // console.log(book.getPeriodStartMonth())

            // if (book.getPeriodStartMonth() != connectedBook.getPeriodStartMonth()) {
            //     connectedBook.setPeriodStartMonth(book.getPeriodStartMonth())
            //     response += ` period start month: ${book.getPeriodStartMonth()}`
            // }

            const stockHistorical = book.getProperty(STOCK_HISTORICAL_PROP);
            if (stockHistorical && stockHistorical != baseBook.getProperty(EXC_HISTORICAL_PROP)) {
                baseBook.setProperty(EXC_HISTORICAL_PROP, stockHistorical);
                response += ` ${EXC_HISTORICAL_PROP}: ${stockHistorical}`;
            }

        }

        if (response != '') {
            await baseBook.update();
            return `${this.buildBookAnchor(baseBook)}: ${response}`;
        }

        return null;

    }

}