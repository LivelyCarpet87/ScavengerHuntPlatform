'use client'
import Form from 'next/form'
import { scoring } from '@/app/actions/submit'
import { Component, JSX, useActionState } from 'react'

export default function ScoringReport(props:any){
    /*
    submGUID={subm.submGUID}
    key={subm.submGUID}
    name={subm.challengeName}
    desc={subm.challDesc}
    submDesc={subm.challDesc}
    files={filelist} 
    feedback={subm.feedback}
    points={subm.pts}
    approval={subm.approval}
    */
    let downloadList:any = []
    for (let i = 0; i < props.files.length; i++){
        const fileInfo = props.files[i]
        downloadList.push(<a href={fileInfo[0]} className='text-blue-700 underline' key={fileInfo[0]}>{fileInfo[1]}</a>)
    }

    let image = null
    if (props.files.length > 0 && (props.files[0][0].endsWith('jpeg') || props.files[0][0].endsWith('jpg') || props.files[0][0].endsWith('png')) ) {
        image = props.files[0][0]
    }

    let solveState = (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className='fill-slate-300 w-5'>
            <path d="M256 48a208 208 0 1 1 0 416 208 208 0 1 1 0-416zm0 464A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-111 111-47-47c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l64 64c9.4 9.4 24.6 9.4 33.9 0L369 209z"/>
        </svg>
    )
    if (props.approval== 1) {
        solveState = (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className='fill-green-800 w-5'>
                <path d="M256 48a208 208 0 1 1 0 416 208 208 0 1 1 0-416zm0 464A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-111 111-47-47c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l64 64c9.4 9.4 24.6 9.4 33.9 0L369 209z"/>
            </svg>
        )
    } else if (props.approval == -1) {
        solveState = (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className='fill-red-800 w-5'>
                <path d="M256 48a208 208 0 1 1 0 416 208 208 0 1 1 0-416zm0 464A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM175 175c-9.4 9.4-9.4 24.6 0 33.9l47 47-47 47c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l47-47 47 47c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-47-47 47-47c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-47 47-47-47c-9.4-9.4-24.6-9.4-33.9 0z"/>
            </svg>
        )
    }
    return (
        <div className='flex flex-col gap-2 p-2 border-2 rounded-lg w-72'>
            <div className='flex flex-row gap-2 items-center'>
                <p className='grow-1 font-bold'>{props.name}</p>
                {props.isComp ? <p>{props.points}</p> : null}
                {solveState}
            </div>
            <div className='flex flex-col gap-2 divide-y-3 divide-dashed flex-nowrap'>
                <p>{props.desc}</p>
                <div>
                    {image && <img src={image} className='h-48 w-full object-cover rounded-md'></img>}
                    <p>{props.submDesc}</p>
                    <div className='flex flex-row gap-2'>
                        {downloadList}
                    </div>
                </div>
                <div>
                    <p>{props.feedback ? props.feedback : "No feedback available."}</p>
                </div>
            </div>
        </div>
    )
}