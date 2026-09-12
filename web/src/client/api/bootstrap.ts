import { getBootstrapOptions } from "../generated/@tanstack/react-query.gen.ts";
import { domainClient } from "./domain-client.ts";

export const bootstrapQueryOptions = () => getBootstrapOptions({ client: domainClient });
