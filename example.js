import {App as AONetwork} from './app';
const aoNet = new AONetwork();

console.log("sss")

/**
 * All events
 */
aoNet.events.use((result) => {
    console.log(result.context);
});

