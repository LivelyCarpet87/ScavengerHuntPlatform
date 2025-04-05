import Link from 'next/link'
import { redirect } from 'next/navigation'
import { verifyAcct } from '@/app/lib/verifyAcct'
import ScoringReport from './scoringReport'
import { openDb } from '@/app/actions/db'


export default async function Challenges() {
    const user = await verifyAcct()

    const db = await openDb()
    const subms = await db.all(
        'SELECT submGUID, challengeName, challenges.description as challDesc, submissions.description as submDesc, time, feedback, pts, approval FROM submissions INNER JOIN challenges ON submissions.challGUID = challenges.challGUID WHERE acctGUID = ? ORDER BY time DESC;',
        user?.acctGUID
    )

    let scoreReports:any = []

    for (let i = 0; i < subms.length; i++) {
        const subm = subms[i]

        const files = await db.all(
            'SELECT fileGUID, filename FROM files WHERE assocGUID = ?;',
            [subm.submGUID]
        )
        let filelist:string[][] = []
        for (let i = 0; i < files.length;i++){
            filelist.push(
                ['/files/'+files[i].fileGUID+ (/.*(\.[A-Za-z0-9]+)/gm.exec(files[i].filename))![1] , files[i].filename]
            )
        }

        scoreReports.push(
            <ScoringReport 
                submGUID={subm.submGUID}
                key={subm.submGUID}
                name={subm.challengeName}
                challDesc={subm.challDesc}
                submDesc={subm.submDesc}
                files={filelist} 
                feedback={subm.feedback}
                points={subm.pts}
                approval={subm.approval}
            />
        )
    }
    return (
        <div>
        <main className="px-auto flex flex-col gap-10 items-center p-10 flex-nowrap">
            <p className="text-3xl font-bold">Submissions</p>
            <div className="flex flex-col md:flex-row gap-5 items-center flex-nowrap">
                {scoreReports}
            </div>
        </main>
        </div>
    );
}
