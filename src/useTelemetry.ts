import { useEffect, useState } from 'react';
import { createTelemetryClient } from './telemetry.ts';

export function useTelemetry(resetVersion:number) {
  const [client]=useState(()=>createTelemetryClient());
  const [state,setState]=useState(client.getState);
  useEffect(()=>{const unsubscribe=client.subscribe(setState);const disconnect=client.connect();return()=>{unsubscribe();disconnect();};},[client]);
  useEffect(()=>{if(resetVersion>0)client.reset();},[client,resetVersion]);
  return state;
}
