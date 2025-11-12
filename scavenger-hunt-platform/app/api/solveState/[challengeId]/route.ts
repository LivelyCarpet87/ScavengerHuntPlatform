import { openDb } from '@/app/actions/db';
import { verifyAcct } from '@/app/lib/verifyAcct';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(  req: NextRequest,
  { params }: { params: Promise<{ challengeId: string }> }
) {
    const { challengeId } = await params;
    const user = await verifyAcct()
    const db = await openDb()
    let teamSolveState = 0
    var teamSolveState_q = await db.get('SELECT MAX(approval) FROM submissions WHERE challGUID = ? AND acctGUID = ?;',[challengeId, user!.acctGUID])
    if (teamSolveState_q){
        teamSolveState = teamSolveState_q['MAX(approval)']
    }
  return NextResponse.json({
    solveStateVal: teamSolveState
  });
}
