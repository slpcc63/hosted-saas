import type { Metadata } from "next";
import "../../../app/globals.css";

export const metadata: Metadata = {
  title: "Sentinel",
  description: "Time Card Manager by SLPCC63"
};

export default function TimeCardManagerLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
