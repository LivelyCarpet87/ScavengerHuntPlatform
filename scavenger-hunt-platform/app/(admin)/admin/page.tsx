'use server'
import { verifyAcct } from "@/app/lib/verifyAcct";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function AdminHome(){
    const user = await verifyAcct()
    if (user!.privLv < 5){
        redirect('/')
    }
    return (
        <div>
          <main className="px-auto flex flex-col gap-10 items-center p-10 flex-nowrap">
            <p className="text-3xl font-bold">Welcome to admin interfaces.</p>
            <div className="flex flex-row gap-5 items-center">
              <Link className="p-2 rounded bg-blue-400 flex flex-row gap-2 items-center" href="/scoring">
                <p>Scoring</p>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" className="w-5 h-5">
                  <path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/>
                </svg>
              </Link>
              <Link className="p-2 rounded bg-blue-400 flex flex-row gap-2 items-center" href="/addChalls">
                <p>Add Challs</p>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" className="w-5 h-5">
                  <path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/>
                </svg>
              </Link>
            </div>
          </main>
        </div>
    )
}