'use client'
import Form from 'next/form'
import { submit_comp_resp } from '@/app/actions/submit'
import { Component, JSX, useActionState } from 'react'
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(res => res.json());

/*
<CompetitionCard 
    name={comp.compName} 
    minPoints={comp.minPts}
    maxPoints={comp.maxPts}
    solveLimit={comp.solveLimit}
    desc={comp.description}
    compGUID={comp.compGUID}
    key={comp.compGUID}
    files={filelist} 
/>
*/

export default function CompetitionCard(props:any){
    
    let downloadList:any = []
    for (let i = 0; i < props.files.length; i++){
        const fileInfo = props.files[i]
        downloadList.push(<a href={fileInfo[0]} className='text-blue-700 underline overflow-hidden text-nowrap text-ellipsis' key={fileInfo[0]}>{fileInfo[1]}</a>)
    }

    let image = null
    if (props.files.length > 0 && (props.files[0][0].endsWith('jpeg') || props.files[0][0].endsWith('jpg') || props.files[0][0].endsWith('png')) ) {
        image = props.files[0][0]
    }

    let point_vals = []
    for (let i = 0; i < props.solveLimit; i++){
        point_vals.push(
            Math.round((props.solveLimit - i)**3 / (props.solveLimit ** 3) * (props.maxPoints - props.minPoints) + props.minPoints)
        )
    }
    point_vals[0] = props.maxPoints
    if (props.solveLimit > 1){
        point_vals[props.solveLimit-1] = props.minPoints
    }

    const { data } = useSWR('/api/compRankings/'+props.compGUID, fetcher, { refreshInterval: 60000, fallbackData: {} });

    
    let rankings:any = []
    for (let i = 0; i < props.solveLimit; i++){
        if (String(i) in data){
            rankings.push(
                <tr className="grid grid-cols-6 gap-1" key={i}>
                    <td className="text-left font-bold">{i+1}</td>
                    <td className="text-left col-span-3 text-nowrap overflow-hidden text-ellipsis">{data[i].teamName}</td>
                    <td className="text-left">{data[i].eval}</td>
                    <td className="text-left">{point_vals[i]}</td>
                </tr>
            )
        } else {
            rankings.push(
                <tr className="grid grid-cols-6 gap-1" key={i}>
                    <td className="text-left font-bold">{i+1}</td>
                    <td className="text-left col-span-3 text-nowrap overflow-hidden text-ellipsis">No team yet...</td>
                    <td className="text-left">N/A</td>
                    <td className="text-left">{point_vals[i]}</td>
                </tr>
            )
        }
    }
    if ("?" in data) {
        rankings.push(
            <tr className="grid grid-cols-6 gap-1" key={"?"}>
                <td className="text-left font-bold">?</td>
                <td className="text-left col-span-3 text-nowrap overflow-hidden text-ellipsis">{data["?"].teamName}</td>
                <td className="text-left">{data["?"].eval}</td>
                <td className="text-left">0</td>
            </tr>
        )
    }

    const [state, action, pending] = useActionState(submit_comp_resp, undefined)
    return (
        <div className='flex flex-col gap-2 p-2 border-2 rounded-lg w-72'>
            <div className='h-fit md:max-h-80 flex flex-col justify-between gap-2'>
                <p className='font-bold'>{props.name}</p>
                <p>{props.desc}</p>
                {image && <img src={image} className='h-48 w-full object-cover rounded-md'></img>}
            </div>
            <div className='flex flex-row gap-2'>
                {downloadList}
            </div>
            <table className='h-fit'>
                <thead>
                    <tr className="grid grid-cols-6 gap-1">
                        <th className="text-left">Rank</th>
                        <th className="text-left col-span-3">Team Name</th>
                        <th className="text-left">Eval</th>
                        <th className="text-left">Pts</th>
                    </tr>
                </thead>
                <tbody>
                    {rankings}
                </tbody>
            </table>
            <div className='grow'></div>
            <Form action={action} className="flex flex-col gap-2 align-items-stretch">
                {state?.errors && <p>{state.errors}</p>}
                <input type="file" accept="image/*" capture="environment" name="file-submission" className="text-elipses border-2 p-1 rounded-sm" />
                <div className="flex flex-row gap-2">
                    <input name="text-submission" placeholder='Text answer' className='w-18 grow border-2 p-1 rounded-sm'></input>
                    <input type='hidden' name='compGUID' value={props.compGUID}></input>
                    <button className='border-2 p-1 bg-blue-700 rounded-lg'>Submit</button>
                </div>
            </Form>
        </div>
    )
}