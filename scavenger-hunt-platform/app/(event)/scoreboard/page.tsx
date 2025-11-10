import { openDb } from "@/app/actions/db";
import { verifyAcct } from "@/app/lib/verifyAcct";
import Scoreboard from "./scoreboard";

export default async function Challenges() {
    
    const user = await verifyAcct()

    return (
    <main className="p-5">
        <Scoreboard acctGUID={user!.acctGUID}>

        </Scoreboard>
    </main>
        
    )
}