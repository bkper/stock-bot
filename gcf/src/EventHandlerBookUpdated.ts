import { Book } from "bkper";
import { STOCK_HISTORICAL_PROP, EXC_HISTORICAL_PROP } from "./constants";
import { EventHandler } from "./EventHandler";
import { isStockBook, getBaseBook } from "./BotService";

export class EventHandlerBookUpdated extends EventHandler {

    protected async processObject(book: Book, connectedBook: Book, event: bkper.Event): Promise<string> {

        let response = '';
        const baseBook = getBaseBook(book);

        if (isStockBook(book)) {
            const stockHistorical = book.getProperty(STOCK_HISTORICAL_PROP);
            if (stockHistorical != baseBook.getProperty(EXC_HISTORICAL_PROP)) {
                baseBook.setProperty(EXC_HISTORICAL_PROP, stockHistorical);
                response += ` ${EXC_HISTORICAL_PROP}: ${stockHistorical}`;
            }
        }

        if (response !== '') {
            await baseBook.update();
            return `${this.buildBookAnchor(baseBook)}: ${response}`;
        }

        return null;

    }

}
