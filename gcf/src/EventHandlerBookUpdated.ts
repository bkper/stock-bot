import { Book } from "bkper";
import { STOCK_HISTORICAL_PROP, EXC_HISTORICAL_PROP } from "./constants";
import { EventHandler } from "./EventHandler";
import { isStockBook, getBaseBooks } from "./BotService";

export class EventHandlerBookUpdated extends EventHandler {

    protected async processObject(book: Book, connectedBook: Book, event: bkper.Event): Promise<string> {

        let response = '';
        const baseBooks = getBaseBooks(book);

        if (isStockBook(book)) {
            const stockHistorical = book.getProperty(STOCK_HISTORICAL_PROP);
            let anchors: string[] = [];
            for (const baseBook of baseBooks) {
                if (stockHistorical !== baseBook.getProperty(EXC_HISTORICAL_PROP)) {
                    baseBook.setProperty(EXC_HISTORICAL_PROP, stockHistorical);
                    anchors.push(this.buildBookAnchor(baseBook));
                }
            }
            response += `${anchors.join(', ')}: ${EXC_HISTORICAL_PROP}: ${stockHistorical}`;
        }

        if (response !== '') {
            for (const baseBook of baseBooks) {
                await baseBook.update();
            }
            return response;
        }

        return null;
    }

}
