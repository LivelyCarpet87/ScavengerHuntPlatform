import { openDb } from "@/app/actions/db";
import { verifyAcct } from "@/app/lib/verifyAcct";

export default async function Challenges() {
    
    const user = await verifyAcct()
    const db = await openDb()
    const accts = await db.all('SELECT acctName, acctGUID FROM accounts WHERE priv < 5')
    
    let scoreboardEntries:any = []
    for (let i = 0; i < accts.length; i++){
        const acct = accts[i]
        let score = 0
        const challs = await db.all('SELECT challGUID, minPts, maxPts, solveThresh FROM challenges;') 
        for (let i = 0; i < challs.length; i++) {
            const chall = challs[i]
            var teamSolveState_q = await db.get('SELECT MAX(approval) as maxAppr FROM submissions WHERE challGUID = ? AND acctGUID = ?;',[chall.challGUID, acct.acctGUID])
            console.log(teamSolveState_q)
            if (teamSolveState_q.maxAppr == 1){
                const solves_q = await db.get(
                    'SELECT count(DISTINCT acctGUID) FROM submissions WHERE approval = 1 AND challGUID = ?;',
                    [chall.challGUID]
                )
                const solves = solves_q['count(challGUID)'] ? solves_q['count(challGUID)'] : 0
                let points = Math.ceil((chall.minPts - chall.maxPts)/(chall.solveThresh ** 2) * (solves **2) + chall.maxPts)
                if (points < chall.minPts){
                    points = chall.minPts
                }
                score += points
            }
        }
        scoreboardEntries.push(
        <tr className="border border-gray-300 flex flex-row w-72 justify-between p-2" key={acct.acctGUID}>
            <td className={acct.acctGUID == user!.acctGUID ? "font-semibold" : ""}>{acct.acctName}</td>
            <td className={acct.acctGUID == user!.acctGUID ? "font-semibold" : ""}>{score}</td>
        </tr>)
    }
    return (
    <main className="p-5">
        <table className="border-collapse border ">
            <thead>
                <tr className="border border-gray-300 flex flex-row w-72 justify-between p-2">
                    <th className="font-extrabold text-xl">Team Name</th>
                    <th className="font-extrabold text-xl">Score</th>
                </tr>
            </thead>
            <tbody>{scoreboardEntries}</tbody>
        </table>
    </main>
        
    )
}