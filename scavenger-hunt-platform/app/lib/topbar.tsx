'use client'
import Link from "next/link";
import { useState } from "react";

export default function TopBar(props:any){
    const [displayNav, setDisplayNav] = useState(false);
    function toggleNav(){
        setDisplayNav(!displayNav)
    }
    return (
        <div className="w-full h-fit sticky top-0 left-0 right-0 z-50 bg-slate-100 dark:bg-slate-900 p-3 md:p-7">
            <div className="flex flex-row justify-between items-center">
                <div>
                    <p className="text-xl text-left">{props.eventName}</p>
                </div>
                <button onClick={toggleNav}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" className="w-8 h-8 fill-current">
                    <path d="M0 96C0 78.3 14.3 64 32 64l384 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 128C14.3 128 0 113.7 0 96zM0 256c0-17.7 14.3-32 32-32l384 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 288c-17.7 0-32-14.3-32-32zM448 416c0 17.7-14.3 32-32 32L32 448c-17.7 0-32-14.3-32-32s14.3-32 32-32l384 0c17.7 0 32 14.3 32 32z"/>
                    </svg>
                </button>
            </div>
            {displayNav && (
                <div className="flex flex-row justify-between items-center mt-3 flex-wrap">
                    <Link className="p-2 rounded bg-blue-400 flex flex-row gap-2 items-center" href="/scoreboard">
                        <p>Scoreboard</p>
                    </Link>
                    <Link className="p-2 rounded bg-blue-400 flex flex-row gap-2 items-center" href="/feedback">
                        <p>Feedback</p>
                    </Link>
                    <Link className="p-2 rounded bg-blue-400 flex flex-row gap-2 items-center" href="/challenges">
                        <p>Challenges</p>
                    </Link>
                    <Link className="p-2 rounded bg-blue-400 flex flex-row gap-2 items-center" href="/competitions">
                        <p>Competitions</p>
                    </Link>
                </div>
            )}
        </div>
    )
}