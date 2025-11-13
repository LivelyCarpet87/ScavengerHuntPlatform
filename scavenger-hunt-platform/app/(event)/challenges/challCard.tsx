'use client'
import Form from 'next/form'
import { submit_chall_resp } from '@/app/actions/submit'
import { Component, JSX, useActionState } from 'react'
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function ChallengeCard(props:any){
    
    let downloadList:any = []
    for (let i = 0; i < props.files.length; i++){
        const fileInfo = props.files[i]
        downloadList.push(<a href={fileInfo[0]} className='text-blue-700 underline overflow-hidden text-nowrap text-ellipsis' key={fileInfo[0]}>{fileInfo[1]}</a>)
    }

    let image = null
    if (props.files.length > 0 && (props.files[0][0].endsWith('jpeg') || props.files[0][0].endsWith('jpg') || props.files[0][0].endsWith('png')) ) {
        image = props.files[0][0]
    }

    const { data } = useSWR('/api/solveState/'+props.challGUID, fetcher, { refreshInterval: 60000, fallbackData: {solveStateVal: props.solveState} });

    let solveState = (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className='fill-slate-300 w-5'>
            <path d="M256 48a208 208 0 1 1 0 416 208 208 0 1 1 0-416zm0 464A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-111 111-47-47c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l64 64c9.4 9.4 24.6 9.4 33.9 0L369 209z"/>
        </svg>
    )
    if (data.solveStateVal == 1) {
        solveState = (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className='fill-green-800 w-5'>
                <path d="M256 48a208 208 0 1 1 0 416 208 208 0 1 1 0-416zm0 464A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-111 111-47-47c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l64 64c9.4 9.4 24.6 9.4 33.9 0L369 209z"/>
            </svg>
        )
    } else if (data.solveStateVal == -1) {
        solveState = (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className='fill-red-800 w-5'>
                <path d="M256 48a208 208 0 1 1 0 416 208 208 0 1 1 0-416zm0 464A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM175 175c-9.4 9.4-9.4 24.6 0 33.9l47 47-47 47c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l47-47 47 47c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-47-47 47-47c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-47 47-47-47c-9.4-9.4-24.6-9.4-33.9 0z"/>
            </svg>
        )
    }

    const [state, action, pending] = useActionState(submit_chall_resp, undefined)
    return (
        <div className='flex flex-col gap-2 p-2 border-2 rounded-lg w-72'>
            <div className='flex flex-row gap-2 items-center'>
                <p className='grow-1 font-bold'>{props.name}</p>
                <p className='font-semibold'>Pts: {props.points}</p>
                {solveState}
            </div>
            <div className='h-fit md:max-h-80 flex flex-col justify-between'>
                <p>{props.desc}</p>
                
                {image && <img src={image} className='h-48 w-full object-cover rounded-md'></img>}
            </div>
            <div className='flex flex-row gap-2'>
                {downloadList}
            </div>
            <div className='grow'></div>
            <Form action={action} className="flex flex-col gap-2 align-items-stretch">
                {state?.errors && <p>{state.errors}</p>}
                <input type="file" accept="image/*,video/*" capture="user" name="file-submission" className="text-elipses border-2 p-1 rounded-sm" />
                <div className="flex flex-row gap-2">
                    <input name="text-submission" placeholder='Text answer' className='w-18 grow border-2 p-1 rounded-sm'></input>
                    <input type='hidden' name='challGUID' value={props.challGUID}></input>
                    <button className='border-2 p-1 bg-blue-700 rounded-lg'>Submit</button>
                </div>
            </Form>
        </div>
    )
}