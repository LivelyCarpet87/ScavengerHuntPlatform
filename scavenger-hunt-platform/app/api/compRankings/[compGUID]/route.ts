import { openDb } from '@/app/actions/db';
import { verifyAcct } from '@/app/lib/verifyAcct';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(  req: NextRequest,
  { params }: { params: Promise<{ compGUID: string }> }
) {
    const { compGUID } = await params;
    const user = await verifyAcct()
    const db = await openDb()
    let ret: { [key: string]: {teamName: string, eval: any} } = {}
    var comp_q = await db.get('SELECT solveThresh, rankSystem FROM competitions WHERE compGUID = ?;',[compGUID])

    if (comp_q == undefined){
      return new NextResponse("Competition Not Found", { status: 404 })
    }

    // MAX, MIN, FIRST, MAX_SUM
    let found_user = false
    let ranking_q
    if (comp_q.rankSystem == 'MAX'){
      ranking_q = await db.all('SELECT accounts.acctGUID as aGUID, acctName, MAX(pts) AS eval FROM submissions INNER JOIN accounts ON submissions.acctGUID = accounts.acctGUID WHERE compGUID = ? AND approval > 0 AND accounts.priv < 5 GROUP BY aGUID ORDER BY eval DESC, time ASC LIMIT ?;',[compGUID, comp_q.solveThresh])
    } else if (comp_q.rankSystem == 'MIN'){
      ranking_q = await db.all('SELECT accounts.acctGUID as aGUID, acctName, MIN(pts) AS eval FROM submissions INNER JOIN accounts ON submissions.acctGUID = accounts.acctGUID WHERE compGUID = ? AND approval > 0 AND accounts.priv < 5 GROUP BY aGUID ORDER BY eval ASC, time ASC LIMIT ?;',[compGUID, comp_q.solveThresh])
    } else if (comp_q.rankSystem == 'MAX_SUM'){
      ranking_q = await db.all('SELECT accounts.acctGUID as aGUID, acctName, SUM(pts) AS eval FROM submissions INNER JOIN accounts ON submissions.acctGUID = accounts.acctGUID WHERE compGUID = ? AND approval > 0 AND accounts.priv < 5 GROUP BY aGUID ORDER BY eval DESC, MAX(time) ASC LIMIT ?;',[compGUID, comp_q.solveThresh])
    } else if (comp_q.rankSystem == 'FIRST'){
      ranking_q = await db.all('SELECT accounts.acctGUID as aGUID, acctName, time AS eval FROM submissions INNER JOIN accounts ON submissions.acctGUID = accounts.acctGUID WHERE compGUID = ? AND approval > 0 AND accounts.priv < 5 GROUP BY aGUID ORDER BY eval ASC LIMIT ?;',[compGUID, comp_q.solveThresh])
    } else {
      return new NextResponse("Comp Format Error", { status: 500 })
    }
    for (let i = 0; i < ranking_q.length; i++) {
      const row = ranking_q[i]
      ret[String(i)] = {
        teamName: row.acctName,
        eval: comp_q.rankSystem != 'FIRST' ? row.eval : i+1
      }
      if (user!.acctGUID == row.aGUID) {
        found_user = true
      }
    }
    if (!found_user){
      let user_q
      if (comp_q.rankSystem == 'MAX'){
        user_q = await db.get('SELECT accounts.acctGUID as aGUID, acctName, MAX(pts) AS eval FROM submissions INNER JOIN accounts ON submissions.acctGUID = accounts.acctGUID WHERE compGUID = ? AND approval > 0 AND aGUID = ? GROUP BY aGUID ORDER BY eval DESC, time ASC;',[compGUID, user!.acctGUID])
      } else if (comp_q.rankSystem == 'MIN'){
        user_q = await db.get('SELECT accounts.acctGUID as aGUID, acctName, MIN(pts) AS eval FROM submissions INNER JOIN accounts ON submissions.acctGUID = accounts.acctGUID WHERE compGUID = ? AND approval > 0 AND aGUID = ? GROUP BY aGUID ORDER BY eval ASC, time ASC;',[compGUID, user!.acctGUID])
      } else if (comp_q.rankSystem == 'MAX_SUM'){
        user_q = await db.get('SELECT accounts.acctGUID as aGUID, acctName, SUM(pts) AS eval FROM submissions INNER JOIN accounts ON submissions.acctGUID = accounts.acctGUID WHERE compGUID = ? AND approval > 0 AND aGUID = ? GROUP BY aGUID ORDER BY eval DESC, time ASC;',[compGUID, user!.acctGUID])
      } else if (comp_q.rankSystem == 'FIRST'){
        user_q = await db.get('SELECT accounts.acctGUID as aGUID, acctName, time AS eval FROM submissions INNER JOIN accounts ON submissions.acctGUID = accounts.acctGUID WHERE compGUID = ? AND approval > 0 AND aGUID = ? GROUP BY aGUID ORDER BY eval ASC;',[compGUID, user!.acctGUID])
      } else {
        return new NextResponse("Comp Format Error", { status: 500 })
      }
      if (user_q != undefined) {
        ret["?"] = {
          teamName: user_q.acctName,
          eval: user_q.eval
        }
      }
    }
    return NextResponse.json(ret);

    
}
