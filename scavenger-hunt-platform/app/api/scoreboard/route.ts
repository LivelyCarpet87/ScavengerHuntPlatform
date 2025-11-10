import { openDb } from "@/app/actions/db";
import { verifyAcct } from "@/app/lib/verifyAcct";
import { NextResponse } from "next/server";

export async function GET() {
    const user = await verifyAcct()
    const db = await openDb()
    const accts = await db.all('SELECT acctName, acctGUID FROM accounts WHERE priv < 5')
    
    let scoreboardEntries:Array<
        {
            name:string,
            guid:string,
            points:number,
            lastSubmission:string,
        }
    > = []

    for (let i = 0; i < accts.length; i++){
        const acct = accts[i]
        scoreboardEntries.push(
            {
                name: acct.acctName,
                guid: acct.acctGUID,
                points: 0,
                lastSubmission: ""
            }
        )
    }

    const challs = await db.all('SELECT challGUID, minPts, maxPts, solveThresh FROM challenges;') 
    for (let i = 0; i < challs.length; i++) {
        const chall = challs[i]
        for (let j = 0; j < accts.length; j++){
            const acct = accts[j]
            var teamSolveState_q = await db.get('SELECT MAX(approval) as maxAppr, time FROM submissions WHERE challGUID = ? AND acctGUID = ?;',[chall.challGUID, acct.acctGUID])
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
                scoreboardEntries[j].points += points
                if (scoreboardEntries[j].lastSubmission.localeCompare(teamSolveState_q.time)){
                    scoreboardEntries[j].lastSubmission = teamSolveState_q.time
                }
            }
        }
        
    }

    const comps = await db.all('SELECT compGUID, minPts, maxPts, solveThresh, rankSystem, compName FROM competitions;') 
    for (let i = 0; i < comps.length; i++) {
        const comp = comps[i]
        for (let j = 0; j < accts.length; j++){
            const acct = accts[j]
            
            let ranking_q
            if (comp.rankSystem == 'MAX'){
                ranking_q = await db.get('SELECT rank, ltime, aGUID FROM (SELECT aGUID, MAX(pts) AS eval, ROW_NUMBER() OVER (ORDER BY MAX(pts) DESC, MAX(time) ASC) AS rank, MAX(time) AS ltime FROM (SELECT submissions.acctGUID as aGUID, pts, time FROM submissions INNER JOIN accounts ON submissions.acctGUID = accounts.acctGUID WHERE compGUID = ? AND approval > 0 AND accounts.priv < 5) GROUP BY aGUID) WHERE aGUID = ?;',[comp.compGUID, acct.acctGUID])
            } else if (comp.rankSystem == 'MIN'){
                ranking_q = await db.get('SELECT rank, ltime, aGUID FROM (SELECT aGUID, MIN(pts) AS eval, ROW_NUMBER() OVER (ORDER BY MIN(pts) ASC, MAX(time) ASC) AS rank, MAX(time) AS ltime FROM (SELECT submissions.acctGUID as aGUID, pts, time FROM submissions INNER JOIN accounts ON submissions.acctGUID = accounts.acctGUID WHERE compGUID = ? AND approval > 0 AND accounts.priv < 5) GROUP BY aGUID) WHERE aGUID = ?;',[comp.compGUID, acct.acctGUID])
            } else if (comp.rankSystem == 'MAX_SUM'){
                ranking_q = await db.get('SELECT rank, ltime, aGUID FROM (SELECT aGUID, SUM(pts) AS eval, ROW_NUMBER() OVER (ORDER BY SUM(pts) DESC, MAX(time) ASC) AS rank, MAX(time) AS ltime FROM (SELECT submissions.acctGUID as aGUID, pts, time FROM submissions INNER JOIN accounts ON submissions.acctGUID = accounts.acctGUID WHERE compGUID = ? AND approval > 0 AND accounts.priv < 5) GROUP BY aGUID) WHERE aGUID = ?;',[comp.compGUID, acct.acctGUID])
            } else if (comp.rankSystem == 'FIRST'){
                ranking_q = await db.get('SELECT rank, ltime, aGUID FROM (SELECT aGUID, SUM(pts) AS eval, ROW_NUMBER() OVER (ORDER BY MAX(time) ASC) AS rank, MAX(time) AS ltime FROM (SELECT submissions.acctGUID as aGUID, pts, time FROM submissions INNER JOIN accounts ON submissions.acctGUID = accounts.acctGUID WHERE compGUID = ? AND approval > 0 AND accounts.priv < 5) GROUP BY aGUID) WHERE aGUID = ?;',[comp.compGUID, acct.acctGUID])
            } else {
                return new NextResponse("Comp Format Error", { status: 500 })
            }
            if (ranking_q == undefined) {
                continue
            }
            const rank = ranking_q.rank -1
            if (rank < comp.solveThresh){
                const point_delta = Math.round((comp.solveThresh - rank)**3 / (comp.solveThresh ** 3) * (comp.maxPts - comp.minPts) + comp.minPts)
                scoreboardEntries[j].points += point_delta
                if (scoreboardEntries[j].lastSubmission.localeCompare(ranking_q.ltime)){
                    scoreboardEntries[j].lastSubmission = ranking_q.ltime
                }
            }
        }
    }

    const scoreboard_sorted = scoreboardEntries.sort(
        (a, b) => { 
            if (a.points != b.points) {
                return b.points - a.points
            } else {
                return a.lastSubmission.localeCompare(b.lastSubmission);
            }
        }
    )
    
    return NextResponse.json({
        scoreboard: scoreboard_sorted
    });
}