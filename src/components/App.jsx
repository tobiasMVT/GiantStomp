import { useEffect, useRef } from "react";
import gameController, { eventBus, stateStore, layoutManager } from "../core/controllerSingleton";
import GameRuntime from "../core/GameRuntime";
import createPhaserGame from "../core/createPhaserGame";

const App = () => {
  const runtimeRef = useRef(null);
  const phaserRef = useRef(null);
  const mountRef = useRef(null);

  if (!runtimeRef.current) {
    runtimeRef.current = new GameRuntime({ gameController, eventBus, stateStore, layoutManager });
    runtimeRef.current.init();
  }

  useEffect(() => {
    if (!mountRef.current) {
      return;
    }

    phaserRef.current = createPhaserGame({
      parentElement: mountRef.current,
      onReady: ({ gameScene, uiScene }) => {
        runtimeRef.current.attachScenes({ gameScene, uiScene });
      }
    });

    return () => {
      phaserRef.current?.destroy();
      phaserRef.current = null;
      runtimeRef.current?.destroy();
    };
  }, []);

  return <div ref={mountRef} style={{ position: "fixed", inset: 0 }} />;
};

export default App;

