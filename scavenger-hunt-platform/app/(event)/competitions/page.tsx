import Link from 'next/link'
import { redirect } from 'next/navigation'
import { verifyAcct } from '@/app/lib/verifyAcct'
import CompetitionCard from './compCard'
import { openDb } from '@/app/actions/db'


export default async function Challenges() {
    const user = await verifyAcct()

    const db = await openDb()
    const comps = await db.all(
        'SELECT compGUID, minPts, maxPts, solveThresh, unlocked, unlockTime, compName, description, rankSystem FROM competitions WHERE unlocked OR unlockTime < datetime() ORDER BY maxPts+minPts DESC;',
    )

    let competitionCards:any = []

    for (let i = 0; i < comps.length; i++) {
        const comp = comps[i]

        const files = await db.all(
            'SELECT fileGUID, filename FROM files WHERE assocGUID = ?;',
            [comp.compGUID]
        )
        let filelist:string[][] = []
        for (let i = 0; i < files.length;i++){
            filelist.push(
                ['/uploads/'+files[i].fileGUID+ (/.*(\.[A-Za-z0-9]+)/gm.exec(files[i].filename))![1] , files[i].filename]
            )
        }

        competitionCards.push(
            <CompetitionCard 
                name={comp.compName} 
                minPoints={comp.minPts}
                maxPoints={comp.maxPts}
                solveLimit={comp.solveThresh}
                desc={comp.description}
                compGUID={comp.compGUID}
                key={comp.compGUID}
                files={filelist} 
            />
        )
    }
    return (
        <div>
        <main className="px-auto flex flex-col gap-10 items-center p-10 flex-nowrap">
            <p className="text-3xl font-bold">Competitions</p>
            <div className="flex flex-col md:flex-row gap-5 items-center max-w-full flex-wrap items-stretch">
                {competitionCards}
            </div>
        </main>
        </div>
    );
}
