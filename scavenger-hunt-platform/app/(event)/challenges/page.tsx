import Link from 'next/link'
import { redirect } from 'next/navigation'
import { verifyAcct } from '@/app/lib/verifyAcct'
import ChallengeCard from './challCard'
import { openDb } from '@/app/actions/db'


export default async function Challenges() {
    const user = await verifyAcct()

    const db = await openDb()
    const challs = await db.all(
        'SELECT challGUID, minPts, maxPts, solveThresh, unlocked, unlockTime, challengeName, description FROM challenges WHERE unlocked OR unlockTime < datetime() ORDER BY maxPts+minPts DESC;',
    )

    let challengeCards:any = []

    for (let i = 0; i < challs.length; i++) {
        const chall = challs[i]

        const solves_q = await db.get(
            'SELECT count(DISTINCT acctGUID) FROM submissions WHERE approval = 1 AND challGUID = ?;',
            [chall.challGUID]
        )
        const solves = solves_q['count(challGUID)'] ? solves_q['count(challGUID)'] : 0
        let points = Math.ceil((chall.minPts - chall.maxPts)/(chall.solveThresh ** 2) * (solves **2) + chall.maxPts)
        if (points < chall.minPts){
            points = chall.minPts
        }

        var teamSolveState = 0;
        var teamSolveState_q = await db.get('SELECT MAX(approval) FROM submissions WHERE challGUID = ? AND acctGUID = ?;',[chall.challGUID, user!.acctGUID])
        if (teamSolveState_q){
            console.log(teamSolveState_q)
            teamSolveState = teamSolveState_q['MAX(approval)']
        }

        const files = await db.all(
            'SELECT fileGUID, filename FROM files WHERE assocGUID = ?;',
            [chall.challGUID]
        )
        let filelist:string[][] = []
        for (let i = 0; i < files.length;i++){
            filelist.push(
                ['/uploads/'+files[i].fileGUID+ (/.*(\.[A-Za-z0-9]+)/gm.exec(files[i].filename))![1] , files[i].filename]
            )
        }

        challengeCards.push(
            <ChallengeCard 
                name={chall.challengeName} 
                points={points}
                teamSolveState={teamSolveState}
                desc={chall.description}
                challGUID={chall.challGUID}
                key={chall.challGUID}
                files={filelist} 
            />
        )
    }
    return (
        <div>
        <main className="px-auto flex flex-col gap-10 items-center p-10 flex-nowrap">
            <p className="text-3xl font-bold">Challenges</p>
            <div className="flex flex-col md:flex-row gap-5 items-center max-w-full flex-wrap">
                {challengeCards}
            </div>
        </main>
        </div>
    );
}
