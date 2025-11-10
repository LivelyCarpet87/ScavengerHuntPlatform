'use server'
import { openDb } from '../../actions/db' 
import {v6 as uuidv6} from 'uuid'
import bcrypt from 'bcryptjs'
import { env } from 'process'
import { NextResponse } from 'next/server'

export async function GET() {
  // Open SQLite connection
  const db = await openDb()

  // Define table schema
  await db.exec(`
    CREATE TABLE accounts (
      acctName TEXT,  
      acctGUID TEXT,
      passwdHash TEXT,
      priv INTEGER DEFAULT 0
    );
    CREATE TABLE submissions (
      submGUID TEXT,  
      time TEXT,
      description TEXT,
      acctGUID TEXT,
      pts INTEGER,
      feedback TEXT,
      approval INTEGER DEFAULT FALSE,
      challGUID TEXT,
      compGUID TEXT
    );
    CREATE TABLE challenges (
      challGUID TEXT,
      challengeName TEXT,
      minPts INTEGER,
      maxPts INTEGER,
      solveThresh INTEGER,
      unlocked INTEGER,
      unlockTime INTEGER DEFAULT NULL,
      description TEXT
    );
    CREATE TABLE competitions (
      compGUID TEXT,
      compName TEXT,
      minPts INTEGER,
      maxPts INTEGER,
      solveThresh INTEGER,
      unlocked INTEGER,
      unlockTime INTEGER DEFAULT NULL,
      description TEXT,
      rankSystem TEXT -- MAX, MIN, FIRST, MAX_SUM
    );
    CREATE TABLE files (
      fileGUID TEXT,
      assocGUID TEXT,
      filename TEXT
    );
  `)

  let ADMIN_PASSWD = process.env.ADMIN_PASSWD || "PLEASE_NO"
  await db.run(
    'INSERT INTO accounts (acctName, acctGUID, passwdHash, priv) VALUES (?, ?, ?, ?);',
    'admin', 
    uuidv6(),
    bcrypt.hashSync(ADMIN_PASSWD),
    10
  )
  
  // Close connection
  await db.close()  
  return new NextResponse('Databases initialized', { status: 200 });
}