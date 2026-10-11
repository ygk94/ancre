import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MeraProto } from "./MeraProto";
import "./mera.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MeraProto />
  </StrictMode>,
);
