'use client'
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function CompetitionCard(props:any){
    const { data } = useSWR('/api/scoreboard', fetcher, { refreshInterval: 60000, fallbackData: {scoreboard: []} });

    let scoreboardEntries:any = []
    for (let i = 0; i < data.scoreboard.length; i++){
        let r_entry = data.scoreboard[i]
        scoreboardEntries.push(
        <tr className="border border-gray-300 flex flex-row w-72 justify-between p-2" key={i}>
            <td className={r_entry.guid == props.acctGUID ? "font-semibold" : ""}>{r_entry.name}</td>
            <td className={r_entry.guid == props.acctGUID ? "font-semibold" : ""}>{r_entry.points}</td>
        </tr>)
    }
    
    return (
        <table className="border-collapse border ">
            <thead>
                <tr className="border border-gray-300 flex flex-row w-72 justify-between p-2">
                    <th className="font-extrabold text-xl">Team Name</th>
                    <th className="font-extrabold text-xl">Score</th>
                </tr>
            </thead>
            <tbody>{scoreboardEntries}</tbody>
        </table>
    )
}