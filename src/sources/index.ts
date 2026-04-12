import * as met from "./met";
import * as aic from "./aic";
import * as rijks from "./rijks";
import * as cma from "./cma";
import * as mia from "./mia";
import type { SourceModule } from "../types";

export const sources: Record<string, SourceModule> = {
  met,
  aic,
  rijks,
  cma,
  mia,
};

export const sourceNames = Object.keys(sources);
