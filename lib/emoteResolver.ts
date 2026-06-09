import { EmoteResolver } from "./emotes";

/** One shared resolver: useChat loads channel sets into it as connectors
 *  spin up; MessageRow fragments against it synchronously at render time. */
export const emoteResolver = new EmoteResolver();
