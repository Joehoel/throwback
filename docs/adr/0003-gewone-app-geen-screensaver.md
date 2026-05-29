# v1 is primair een gewone app; DreamService wordt aangeboden maar niet vereist

De wens was een "vanzelf aan"-ervaring zoals Google's ambient-modus. Onderzoek wijst uit dat een app op Android wél een `DreamService` (screensaver) kan aanbieden, maar zichzelf nooit programmatisch als actieve screensaver kan instellen — de gebruiker moet dat handmatig kiezen. Op Google TV is die kiezer bovendien dichtgetimmerd: op veel versies verschijnen screensavers van derden er niet, of pas na een ADB-omweg. Het gedrag verschilt per apparaat en OS-versie.

Daarom: **de schermvullende, handmatig te openen app is de primaire en betrouwbare vorm.** Daarnaast registreren we de app óók als `DreamService`, zodat de gebruiker hem op kastjes waar de instellingen dat toelaten als screensaver kan kiezen. De render-kern wordt gedeeld, dus dit is goedkoop. We rekenen er niet op dat het op elk apparaat selecteerbaar is.
