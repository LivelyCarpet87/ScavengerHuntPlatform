'use client'
import Form from 'next/form'
import { scoring } from '@/app/actions/submit'
import { useActionState } from 'react'

export default function ScoreCard(props:any){
    /*
    submGUID={subm.submGUID}
    key={subm.submGUID}
    name={subm.challengeName}
    challDesc={subm.challDesc}
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

    const [state, action, pending] = useActionState(scoring, undefined)
    return (
        <div className='flex flex-col gap-2 p-2 border-2 rounded-lg w-72'>
            <div className='flex flex-row gap-2 items-center'>
                <p className='grow-1 font-bold'>{props.name}</p>
            </div>
            <div className='flex flex-col gap-2 divide-y-2 divide-dashed flex-nowrap'>
                <p>{props.challDesc}</p>
                <div>
                    {image && <img src={image} className='h-48 w-full object-cover rounded-md'></img>}
                    <p>{props.submDesc}</p>
                </div>
            </div>
            <div className='flex flex-row gap-2'>
                {downloadList}
            </div>
            <div className='grow'></div>
            <Form action={action} className="flex flex-col gap-2 align-items-stretch w-full">
                {state?.errors && <p>{state.errors}</p>}
                <input name="feedback" placeholder='Feedback' defaultValue={props.feedback} className='w-full border-2 p-1 rounded-sm'></input>
                <input type='hidden' name='submGUID' value={props.submGUID}></input>
                <div className="flex flex-row gap-2 justify-between">
                    <div className="flex flex-row gap-1">
                        {props.approval == -1 ? <input name="approval" type="radio" value={-1}  className='w-10 h-10 accent-red-700' defaultChecked></input> : <input name="approval" type="radio" value={-1}  className='w-10 h-10 accent-red-700'></input>}
                        {props.approval == 0 ? <input name="approval" type="radio" value={0} className='w-10 h-10 accent-slate-700' defaultChecked></input> : <input name="approval" type="radio" value={0} className='w-10 h-10 accent-slate-700'></input>}
                        {props.approval == 1 ? <input name="approval" type="radio" value={1} className='w-10 h-10 accent-green-700' defaultChecked></input> : <input name="approval" type="radio" value={1} className='w-10 h-10 accent-green-700'></input>}
                    </div>
                    <input name="points" placeholder='[+/-] x' defaultValue={props.points} className='w-10 grow border-2 p-1 rounded-sm'></input>
                    <button className='border-2 p-1 bg-blue-700 rounded-lg'>Update</button>
                </div>
            </Form>
        </div>
    )
}